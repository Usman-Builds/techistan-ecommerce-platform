import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import {
  OrderNoteVisibility,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ReturnStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotifierService } from '../notification/notifier.service';
import { CouponService, type PromotionLine } from '../coupon/coupon.service';
import { effectivePriceCents, isSaleActive } from '../coupon/sale-pricing';
import { PaymentService } from '../payment/payment.service';
import { PricingService } from './pricing.service';
import { CreateOrderDto, OrderAddressDto } from './dto/create-order.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { SetTrackingDto } from './dto/set-tracking.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { AdminOrderQueryDto, OrderQueryDto } from './dto/order-query.dto';
import {
  buildTrackingUrl,
  canTransition,
  CUSTOMER_CANCELLABLE,
  RETURN_ELIGIBLE,
} from './order-status';

/** Loads an order with the fields the client + confirmation view need. */
const ORDER_INCLUDE = Prisma.validator<Prisma.OrderInclude>()({
  items: true,
  payments: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      amount: true,
      refundedAmount: true,
      currency: true,
      method: true,
    },
  },
});

/** Full order graph for detail pages (customer + admin). */
const ORDER_DETAIL_INCLUDE = Prisma.validator<Prisma.OrderInclude>()({
  items: true,
  payments: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      amount: true,
      refundedAmount: true,
      currency: true,
      method: true,
    },
  },
  shipmentEvents: { orderBy: { occurredAt: 'desc' } },
  notes: { orderBy: { createdAt: 'desc' } },
  returnRequests: { orderBy: { createdAt: 'desc' } },
});

/** Detail graph plus the customer record — admin only. */
const ADMIN_ORDER_INCLUDE = Prisma.validator<Prisma.OrderInclude>()({
  ...ORDER_DETAIL_INCLUDE,
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
});

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof ORDER_INCLUDE;
}>;
type OrderDetail = Prisma.OrderGetPayload<{
  include: typeof ORDER_DETAIL_INCLUDE;
}>;
type AdminOrderDetail = Prisma.OrderGetPayload<{
  include: typeof ADMIN_ORDER_INCLUDE;
}>;

export interface OrderActor {
  userId: number;
  role: Role;
}

/** Snapshot of one returned line, frozen on the ReturnRequest at request time. */
export interface ReturnItemSnapshot {
  orderItemId: string;
  variantId: string | null;
  sku: string;
  productTitle: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Order domain (scripts 10 + 11). `createOrder` (10) is idempotent, recomputes all
 * money server-side, and delegates the PaymentIntent to {@link PaymentService}.
 * Script 11 adds the lifecycle: enforced status transitions (never trusting the
 * client — NFR-208), shipment tracking, internal/customer notes, returns, and the
 * customer + admin read/query APIs. Every mutation writes an audit log and fires
 * the (stubbed) email hook.
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coupon: CouponService,
    private readonly payment: PaymentService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
    private readonly notifier: NotifierService,
  ) {}

  // ─────────────────────────── Create (idempotent) ───────────────────────────

  async createOrder(
    dto: CreateOrderDto,
    userId: number | null,
    cartId: string | null,
  ): Promise<{
    order: ReturnType<typeof OrderService.toView>;
    clientSecret: string | null;
  }> {
    // 1. Idempotency — a repeated submission returns the existing order.
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: ORDER_INCLUDE,
    });
    if (existing) {
      const clientSecret = await this.resolveClientSecret(existing.id);
      return { order: OrderService.toView(existing), clientSecret };
    }

    // 2. Load the cart and build authoritative line snapshots from live variants.
    if (!cartId) throw new BadRequestException('Your cart is empty.');
    const lines = await this.buildLines(cartId);
    const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
    // The promotions view of the same lines. Built once and shared by the
    // coupon and the automatic-discount pass so the two cannot disagree.
    const promotionLines: PromotionLine[] = lines.map((l) => ({
      productId: l.productId,
      categoryId: l.categoryId,
      quantity: l.quantity,
      lineTotalCents: l.total,
      onSale: l.onSale,
    }));

    // 3. Re-validate the applied coupon against the live subtotal.
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      select: { couponCode: true },
    });
    const coupon = await this.resolveCoupon(
      cart?.couponCode ?? null,
      subtotal,
      userId,
      promotionLines,
    );
    const { couponCode } = coupon;

    // 3b. Automatic (no-code) cart-rule discounts (FR-603), stacked with the
    // coupon per CouponService's documented precedence. Both are computed on the
    // raw subtotal and the combined discount is clamped so it can't exceed it.
    const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
    const autos = await this.coupon.evaluateAutomaticDiscounts({
      subtotalCents: subtotal,
      itemCount,
      lines: promotionLines,
    });
    const autoDiscount = autos.reduce((sum, d) => sum + d.discountCents, 0);
    const discountCents = Math.min(
      subtotal,
      coupon.discountCents + autoDiscount,
    );
    const freeShipping =
      coupon.freeShipping || autos.some((d) => d.freeShipping);

    // 4. Server-side shipping + tax (FR-404/405).
    const quote = await this.pricing.quote({
      address: dto.shippingAddress,
      subtotalCents: subtotal,
      discountCents,
      freeShipping,
    });

    const grandTotal = Math.max(
      0,
      subtotal - discountCents + quote.shippingCents + quote.taxCents,
    );

    // 5. Persist Order + OrderItems + a pending Payment (retry on number clash).
    const billing = dto.billingAddress ?? dto.shippingAddress;
    const zeroDue = grandTotal <= 0;
    const created = await this.persistOrder({
      dto,
      userId,
      cartId,
      lines,
      subtotal,
      discountCents,
      couponCode,
      quote,
      grandTotal,
      billing,
      zeroDue,
    });

    // 6. A fully-discounted ($0) order needs no Stripe intent — it is confirmed
    // in the same transaction above; return no client secret.
    if (zeroDue) {
      return { order: OrderService.toView(created), clientSecret: null };
    }

    // 7. Create the Stripe PaymentIntent (order persists even if this throws, so
    // a missing-key 503 in dev still leaves an inspectable PENDING order).
    const { clientSecret } = await this.payment.createIntent({
      orderId: created.id,
      paymentId: created.payments[0]?.id ?? '',
      amountCents: grandTotal,
      currency: quote.currency,
      idempotencyKey: dto.idempotencyKey,
    });

    return { order: OrderService.toView(created), clientSecret };
  }

  // ─────────────────────────── Customer reads ───────────────────────────

  /**
   * Fetch one order (detail). Owner or admin only for customer orders; guest
   * orders (null userId) are readable by anyone holding the unguessable order id —
   * the capability the guest client itself has for confirmation polling. A blocked
   * lookup returns 404, never 403, so order existence is not leaked. Internal notes
   * are only serialized for an admin caller.
   */
  async getOrder(id: string, actor: OrderActor | null) {
    let order = await this.prisma.order.findUnique({
      where: { id },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');

    const isAdmin =
      actor?.role === Role.ADMIN || actor?.role === Role.SUPER_ADMIN;
    if (order.userId != null) {
      const isOwner = actor?.userId === order.userId;
      if (!isOwner && !isAdmin) throw new NotFoundException('Order not found');
    }

    // The confirmation page polls this until the order leaves PENDING. If the
    // Stripe webhook is missing or late, settle the payment from Stripe directly.
    if (await this.reconcilePendingPayment(order)) {
      order =
        (await this.prisma.order.findUnique({
          where: { id },
          include: ORDER_DETAIL_INCLUDE,
        })) ?? order;
    }
    return OrderService.toDetail(order, { includeInternalNotes: isAdmin });
  }

  /**
   * Webhook fallback for an order still awaiting payment: ask Stripe for the
   * intent's real state (see PaymentService.reconcile). Runs only after the
   * caller passed the read check above. Returns true when the order changed.
   */
  private async reconcilePendingPayment(order: {
    id: string;
    status: OrderStatus;
    payments: { status: PaymentStatus }[];
  }): Promise<boolean> {
    const latest = order.payments[0];
    if (
      order.status !== OrderStatus.PENDING ||
      (latest?.status !== PaymentStatus.PROCESSING &&
        latest?.status !== PaymentStatus.REQUIRES_PAYMENT)
    ) {
      return false;
    }
    const payment = await this.prisma.payment.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
      select: { stripePaymentIntentId: true },
    });
    if (!payment?.stripePaymentIntentId) return false;
    return this.payment.reconcile(payment.stripePaymentIntentId);
  }

  /** List the signed-in customer's orders (most recent first), with filters. */
  async listMyOrders(userId: number, query: OrderQueryDto = {}) {
    const where: Prisma.OrderWhereInput = { userId };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.orderNumber = { contains: query.search, mode: 'insensitive' };
    }
    this.applyDateRange(where, query.from, query.to);

    const orders = await this.prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => OrderService.toView(o));
  }

  // ─────────────────────────── Customer mutations ───────────────────────────

  /**
   * Customer self-cancel — allowed only while the order is still unpaid
   * (PENDING). A paid order must go through the returns flow; this keeps the
   * cancel path free of a refund side effect and never leaves money uncaptured.
   */
  async cancelOrder(orderId: string, actor: OrderActor) {
    const order = await this.loadOwnedOrder(orderId, actor);
    if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
      throw new BadRequestException(
        'This order can no longer be cancelled. If it has shipped, request a return instead.',
      );
    }
    await this.transition(order, OrderStatus.CANCELLED, actor.userId, {
      action: 'order.cancel',
    });
    return this.getOrder(orderId, actor);
  }

  /**
   * Customer return request (FR-508). Eligible only for delivered/completed
   * orders; each requested line must belong to the order and not exceed the
   * purchased quantity. Creates a REQUESTED ReturnRequest with a frozen item
   * snapshot so an approved refund is computed from stable numbers.
   */
  async requestReturn(
    orderId: string,
    actor: OrderActor,
    dto: CreateReturnDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== actor.userId) {
      throw new NotFoundException('Order not found');
    }
    if (!RETURN_ELIGIBLE.includes(order.status)) {
      throw new BadRequestException(
        'Only delivered orders are eligible for a return.',
      );
    }

    const snapshot: ReturnItemSnapshot[] = dto.items.map((req) => {
      const line = order.items.find((i) => i.id === req.orderItemId);
      if (!line) {
        throw new BadRequestException(
          `Item ${req.orderItemId} is not part of this order.`,
        );
      }
      if (req.quantity > line.quantity) {
        throw new BadRequestException(
          `Cannot return ${req.quantity} of "${line.productTitle}" — only ${line.quantity} were purchased.`,
        );
      }
      return {
        orderItemId: line.id,
        variantId: line.variantId,
        sku: line.sku,
        productTitle: line.productTitle,
        quantity: req.quantity,
        unitPrice: line.unitPrice,
      };
    });

    const ret = await this.prisma.returnRequest.create({
      data: {
        orderId: order.id,
        reasonCode: dto.reasonCode,
        note: dto.note,
        status: ReturnStatus.REQUESTED,
        items: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    await this.audit.record({
      actorId: actor.userId,
      action: 'order.return.request',
      entityType: 'Order',
      entityId: order.id,
      metadata: { returnId: ret.id, reasonCode: dto.reasonCode },
    });
    void this.notifier.returnUpdated(order, 'REQUESTED');

    return OrderService.toReturnView(ret);
  }

  // ─────────────────────────── Admin reads ───────────────────────────

  /** Paginated list of ALL orders with filters (FR-506). */
  async listAdminOrders(query: AdminOrderQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.paymentStatus) {
      where.payments = { some: { status: query.paymentStatus } };
    }
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    this.applyDateRange(where, query.from, query.to);

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: orders.map((o) => OrderService.toView(o)),
      total,
      page,
      pageSize,
    };
  }

  /** Full admin order detail (all notes, tracking, returns, customer). */
  async getAdminOrder(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: ADMIN_ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');
    return OrderService.toAdminDetail(order);
  }

  // ─────────────────────────── Admin mutations ───────────────────────────

  /** Admin status transition (FR-501). REFUNDED must go through the refund flow. */
  async updateStatus(
    orderId: string,
    status: OrderStatus,
    note: string | undefined,
    actor: OrderActor,
  ) {
    if (status === OrderStatus.REFUNDED) {
      throw new BadRequestException(
        'Use the refund action to refund an order, not a status change.',
      );
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    await this.transition(order, status, actor.userId, {
      action: 'order.status',
      note,
    });
    return this.getAdminOrder(orderId);
  }

  /**
   * Set shipment tracking (FR-504): record a ShipmentEvent, build the carrier URL,
   * move the order to SHIPPED, and fire the shipping email hook.
   */
  async setTracking(orderId: string, dto: SetTrackingDto, actor: OrderActor) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    const shippable: OrderStatus[] = [
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
    ];
    if (!shippable.includes(order.status)) {
      throw new BadRequestException(
        'Tracking can only be added to a confirmed, processing, or shipped order.',
      );
    }

    const trackingUrl = buildTrackingUrl(dto.carrier, dto.trackingNumber);
    const willShip = order.status !== OrderStatus.SHIPPED;

    await this.prisma.$transaction(async (tx) => {
      await tx.shipmentEvent.create({
        data: {
          orderId: order.id,
          status: OrderStatus.SHIPPED,
          carrier: dto.carrier,
          trackingNumber: dto.trackingNumber,
          trackingUrl,
          note: dto.note,
        },
      });
      if (willShip) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.SHIPPED },
        });
      }
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'order.tracking',
          entityType: 'Order',
          entityId: order.id,
          metadata: {
            carrier: dto.carrier,
            trackingNumber: dto.trackingNumber,
            trackingUrl,
          },
        },
        tx,
      );
    });

    void this.notifier.orderShipped(order, {
      carrier: dto.carrier,
      trackingNumber: dto.trackingNumber,
      trackingUrl,
    });

    return this.getAdminOrder(orderId);
  }

  /** Add an internal or customer-visible note (FR-507). */
  async addNote(orderId: string, dto: AddNoteDto, actor: OrderActor) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    const note = await this.prisma.orderNote.create({
      data: {
        orderId: order.id,
        authorId: actor.userId,
        body: dto.body,
        visibility: dto.visibility ?? OrderNoteVisibility.INTERNAL,
      },
    });
    await this.audit.record({
      actorId: actor.userId,
      action: 'order.note',
      entityType: 'Order',
      entityId: order.id,
      metadata: { noteId: note.id, visibility: note.visibility },
    });
    return OrderService.toNoteView(note);
  }

  /**
   * Approve a return (FR-508): mark APPROVED, restock the returned units, and best-
   * effort refund the returned amount. A missing-payment / unconfigured-Stripe
   * situation does not block the approval — it is recorded with a zero refund.
   */
  async approveReturn(
    orderId: string,
    returnId: string,
    note: string | undefined,
    actor: OrderActor,
  ) {
    const ret = await this.loadPendingReturn(orderId, returnId);
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    const items = OrderService.parseReturnItems(ret.items);
    const refundTarget = items.reduce(
      (sum, i) => sum + i.unitPrice * i.quantity,
      0,
    );

    // Restock the returned units.
    await this.prisma.$transaction(async (tx) => {
      for (const i of items) {
        if (!i.variantId) continue;
        await tx.productVariant.update({
          where: { id: i.variantId },
          data: { stock: { increment: i.quantity } },
        });
      }
    });

    // Best-effort refund of the returned amount.
    let refunded = 0;
    try {
      const result = await this.payment.processRefund(
        orderId,
        refundTarget,
        actor.userId,
      );
      refunded = result.amountCents;
    } catch (err) {
      if (
        err instanceof ServiceUnavailableException ||
        err instanceof BadRequestException
      ) {
        this.logger.warn(
          `Return ${returnId} approved without a Stripe refund: ${err.message}`,
        );
      } else {
        throw err;
      }
    }

    const updated = await this.prisma.returnRequest.update({
      where: { id: ret.id },
      data: {
        status: ReturnStatus.APPROVED,
        refundAmount: refunded,
        note: note ?? ret.note,
      },
    });
    await this.audit.record({
      actorId: actor.userId,
      action: 'order.return.approve',
      entityType: 'Order',
      entityId: orderId,
      metadata: { returnId, refundAmount: refunded },
    });
    void this.notifier.returnUpdated(order, 'APPROVED');
    return OrderService.toReturnView(updated);
  }

  /** Reject a return (FR-508). */
  async rejectReturn(
    orderId: string,
    returnId: string,
    note: string | undefined,
    actor: OrderActor,
  ) {
    const ret = await this.loadPendingReturn(orderId, returnId);
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    const updated = await this.prisma.returnRequest.update({
      where: { id: ret.id },
      data: { status: ReturnStatus.REJECTED, note: note ?? ret.note },
    });
    await this.audit.record({
      actorId: actor.userId,
      action: 'order.return.reject',
      entityType: 'Order',
      entityId: orderId,
      metadata: { returnId },
    });
    void this.notifier.returnUpdated(order, 'REJECTED');
    return OrderService.toReturnView(updated);
  }

  // ─────────────────────────── Internals ───────────────────────────

  /**
   * Validate + apply a lifecycle transition (FR-501). Writes the status change,
   * an optional internal note, and an audit entry in one transaction; fires the
   * status email hook after commit.
   */
  private async transition(
    order: {
      id: string;
      status: OrderStatus;
      email: string;
      orderNumber: string;
      userId: number | null;
    },
    next: OrderStatus,
    actorId: number | null,
    opts: { action: string; note?: string },
  ) {
    if (!canTransition(order.status, next)) {
      throw new BadRequestException(
        `Cannot move an order from ${order.status} to ${next}.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: next },
      });
      if (opts.note) {
        await tx.orderNote.create({
          data: {
            orderId: order.id,
            authorId: actorId,
            body: opts.note,
            visibility: OrderNoteVisibility.INTERNAL,
          },
        });
      }
      await this.audit.record(
        {
          actorId,
          action: opts.action,
          entityType: 'Order',
          entityId: order.id,
          metadata: { from: order.status, to: next },
        },
        tx,
      );
    });
    void this.notifier.orderStatusChanged(order, next);
  }

  /** Load a customer-owned order or throw 404 (never leak existence). */
  private async loadOwnedOrder(orderId: string, actor: OrderActor) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || order.userId !== actor.userId) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  /** Load a REQUESTED return belonging to the order, or throw. */
  private async loadPendingReturn(orderId: string, returnId: string) {
    const ret = await this.prisma.returnRequest.findUnique({
      where: { id: returnId },
    });
    if (!ret || ret.orderId !== orderId) {
      throw new NotFoundException('Return request not found');
    }
    if (ret.status !== ReturnStatus.REQUESTED) {
      throw new BadRequestException('This return has already been resolved.');
    }
    return ret;
  }

  private applyDateRange(
    where: Prisma.OrderWhereInput,
    from?: string,
    to?: string,
  ): void {
    const range: Prisma.DateTimeFilter = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) range.gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) range.lte = d;
    }
    if (range.gte || range.lte) where.createdAt = range;
  }

  private async resolveClientSecret(orderId: string): Promise<string | null> {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment?.stripePaymentIntentId) return null;
    try {
      return await this.payment.getClientSecret(payment.stripePaymentIntentId);
    } catch (err) {
      this.logger.warn(
        `Could not retrieve client secret for order ${orderId}: ${String(err)}`,
      );
      return null;
    }
  }

  /** Build order-item snapshots from live variants; reject unpurchasable lines. */
  private async buildLines(cartId: string) {
    const items = await this.prisma.cartItem.findMany({
      where: { cartId },
      include: {
        variant: {
          // `id` and `categoryId` are read for promotion scoping, not display:
          // a category-scoped coupon has to know which category each line
          // belongs to, and it must agree with what the cart told the shopper.
          include: {
            product: { select: { id: true, title: true, categoryId: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (items.length === 0)
      throw new BadRequestException('Your cart is empty.');

    return items.map((item) => {
      const { variant } = item;
      const title = variant.product.title;
      if (variant.stock <= 0) {
        throw new BadRequestException(`"${title}" is out of stock.`);
      }
      if (variant.stock < item.quantity) {
        throw new BadRequestException(
          `Only ${variant.stock} of "${title}" left — please review your cart.`,
        );
      }
      // Authoritative live price, honoring any active scheduled sale (FR-604).
      const unitPrice = effectivePriceCents(variant);
      return {
        variantId: variant.id,
        productTitle: title,
        variantOptions: (variant.options as Prisma.InputJsonValue) ?? {},
        sku: variant.sku,
        quantity: item.quantity,
        unitPrice,
        total: unitPrice * item.quantity,
        // Promotion-scoping fields. Not persisted on OrderItem — they are read
        // once, here, to re-validate the coupon against the same lines the cart
        // used.
        productId: variant.product.id,
        categoryId: variant.product.categoryId,
        onSale: isSaleActive(variant),
      };
    });
  }

  private async resolveCoupon(
    code: string | null,
    subtotal: number,
    userId: number | null,
    lines: PromotionLine[],
  ): Promise<{
    discountCents: number;
    freeShipping: boolean;
    couponCode: string | null;
  }> {
    if (!code)
      return { discountCents: 0, freeShipping: false, couponCode: null };
    try {
      const r = await this.coupon.validate(code, {
        subtotalCents: subtotal,
        userId,
        lines,
      });
      return {
        discountCents: r.discountCents,
        freeShipping: r.freeShipping,
        couponCode: r.code,
      };
    } catch {
      // Coupon no longer valid at checkout time → drop it. The recomputed total
      // is authoritative and the review step reflects it.
      this.logger.warn(`Coupon "${code}" invalid at checkout; dropping.`);
      return { discountCents: 0, freeShipping: false, couponCode: null };
    }
  }

  private async persistOrder(params: {
    dto: CreateOrderDto;
    userId: number | null;
    cartId: string;
    lines: Awaited<ReturnType<OrderService['buildLines']>>;
    subtotal: number;
    discountCents: number;
    couponCode: string | null;
    quote: Awaited<ReturnType<PricingService['quote']>>;
    grandTotal: number;
    billing: OrderAddressDto;
    zeroDue: boolean;
  }): Promise<OrderWithRelations> {
    const {
      dto,
      userId,
      cartId,
      lines,
      subtotal,
      discountCents,
      couponCode,
      quote,
      grandTotal,
      billing,
      zeroDue,
    } = params;

    for (let attempt = 0; attempt < 5; attempt++) {
      const orderNumber = OrderService.generateOrderNumber();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const order = await tx.order.create({
            data: {
              orderNumber,
              userId,
              email: dto.email,
              status: zeroDue ? OrderStatus.CONFIRMED : OrderStatus.PENDING,
              subtotal,
              shippingTotal: quote.shippingCents,
              taxTotal: quote.taxCents,
              discountTotal: discountCents,
              grandTotal,
              currency: quote.currency,
              shippingAddress:
                dto.shippingAddress as unknown as Prisma.InputJsonValue,
              billingAddress: billing as unknown as Prisma.InputJsonValue,
              couponCode,
              idempotencyKey: dto.idempotencyKey,
              cartId,
              items: {
                create: lines.map((l) => ({
                  variantId: l.variantId,
                  productTitle: l.productTitle,
                  variantOptions: l.variantOptions,
                  sku: l.sku,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  total: l.total,
                })),
              },
              payments: {
                create: {
                  amount: grandTotal,
                  currency: quote.currency,
                  status: zeroDue
                    ? PaymentStatus.SUCCEEDED
                    : PaymentStatus.REQUIRES_PAYMENT,
                },
              },
            },
            include: ORDER_INCLUDE,
          });

          // A $0 order is finalized inline (no Stripe): decrement stock, record
          // redemption, and clear the cart — the same effects the webhook applies.
          if (zeroDue) {
            for (const l of lines) {
              await tx.productVariant.update({
                where: { id: l.variantId },
                data: { stock: { decrement: l.quantity } },
              });
            }
            if (couponCode) {
              await this.coupon.recordRedemption(
                tx,
                couponCode,
                order.id,
                userId,
              );
            }
            await tx.cartItem.deleteMany({ where: { cartId } });
            await tx.cart.updateMany({
              where: { id: cartId },
              data: { couponCode: null },
            });
          }

          // Optionally save the shipping address to the customer's address book.
          if (dto.saveAddress && userId) {
            await tx.address.create({
              data: {
                userId,
                fullName: dto.shippingAddress.fullName,
                phone: dto.shippingAddress.phone,
                line1: dto.shippingAddress.line1,
                line2: dto.shippingAddress.line2,
                city: dto.shippingAddress.city,
                state: dto.shippingAddress.state,
                postalCode: dto.shippingAddress.postalCode,
                country: dto.shippingAddress.country,
              },
            });
          }

          return order;
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          (err.meta?.target as string[] | undefined)?.includes('orderNumber')
        ) {
          continue; // number collision — regenerate and retry
        }
        throw err;
      }
    }
    throw new Error(
      'Could not generate a unique order number after 5 attempts.',
    );
  }

  /** ORD-YYYYMMDD-NNNN (NNNN is random; uniqueness enforced by the DB). */
  private static generateOrderNumber(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const suffix = String(randomInt(0, 10000)).padStart(4, '0');
    return `ORD-${y}${m}${d}-${suffix}`;
  }

  private static parseReturnItems(raw: Prisma.JsonValue): ReturnItemSnapshot[] {
    if (!Array.isArray(raw)) return [];
    return raw as unknown as ReturnItemSnapshot[];
  }

  // ─────────────────────────── Serializers (all money in cents) ──────────────

  /** Basic order view (confirmation polling + list rows). */
  static toView(order: OrderWithRelations) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      email: order.email,
      currency: order.currency,
      subtotal: order.subtotal,
      shippingTotal: order.shippingTotal,
      taxTotal: order.taxTotal,
      discountTotal: order.discountTotal,
      grandTotal: order.grandTotal,
      couponCode: order.couponCode,
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      paymentStatus: order.payments[0]?.status ?? null,
      items: order.items.map((i) => ({
        id: i.id,
        productTitle: i.productTitle,
        variantOptions: i.variantOptions,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.total,
      })),
      createdAt: order.createdAt,
    };
  }

  /** Detail view — adds tracking, notes (filtered), and returns. */
  static toDetail(order: OrderDetail, opts: { includeInternalNotes: boolean }) {
    const payment = order.payments[0];
    const notes = order.notes.filter(
      (n) =>
        opts.includeInternalNotes ||
        n.visibility === OrderNoteVisibility.CUSTOMER,
    );
    return {
      ...OrderService.toView(order as unknown as OrderWithRelations),
      paymentMethod: payment?.method ?? null,
      refundedAmount: payment?.refundedAmount ?? 0,
      shipmentEvents: order.shipmentEvents.map((e) => ({
        id: e.id,
        status: e.status,
        carrier: e.carrier,
        trackingNumber: e.trackingNumber,
        trackingUrl: e.trackingUrl,
        note: e.note,
        occurredAt: e.occurredAt,
      })),
      notes: notes.map((n) => OrderService.toNoteView(n)),
      returns: order.returnRequests.map((r) => OrderService.toReturnView(r)),
    };
  }

  /** Admin detail — includes the customer record and all (internal) notes. */
  static toAdminDetail(order: AdminOrderDetail) {
    return {
      ...OrderService.toDetail(order, { includeInternalNotes: true }),
      customer: order.user
        ? {
            id: order.user.id,
            email: order.user.email,
            firstName: order.user.firstName,
            lastName: order.user.lastName,
          }
        : null,
    };
  }

  static toNoteView(note: {
    id: string;
    body: string;
    visibility: OrderNoteVisibility;
    authorId: number | null;
    createdAt: Date;
  }) {
    return {
      id: note.id,
      body: note.body,
      visibility: note.visibility,
      authorId: note.authorId,
      createdAt: note.createdAt,
    };
  }

  static toReturnView(ret: {
    id: string;
    reasonCode: string;
    status: ReturnStatus;
    note: string | null;
    items: Prisma.JsonValue;
    refundAmount: number | null;
    createdAt: Date;
  }) {
    return {
      id: ret.id,
      reasonCode: ret.reasonCode,
      status: ret.status,
      note: ret.note,
      items: OrderService.parseReturnItems(ret.items),
      refundAmount: ret.refundAmount,
      createdAt: ret.createdAt,
    };
  }
}
