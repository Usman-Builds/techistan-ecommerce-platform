import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CouponService,
  type AppliedAutomaticDiscount,
  type PromotionLine,
} from '../coupon/coupon.service';
import {
  compareAtWhenOnSale,
  effectivePriceCents,
  isSaleActive,
} from '../coupon/sale-pricing';
import { ABANDONED_FINAL_MS, ABANDONED_FIRST_MS } from './cart.constants';
import { EstimateShippingDto } from './dto/estimate-shipping.dto';

/** Loads a cart with everything the view needs (line variant → product image). */
const CART_INCLUDE = Prisma.validator<Prisma.CartInclude>()({
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      variant: {
        include: {
          product: {
            select: {
              id: true,
              title: true,
              slug: true,
              // Read for promotion scoping (a category-scoped coupon has to
              // know which category each line belongs to), not for display.
              categoryId: true,
              images: {
                orderBy: { position: 'asc' },
                take: 1,
                select: { url: true, alt: true },
              },
            },
          },
        },
      },
    },
  },
});

type CartWithItems = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;

/** Per-line stock signal surfaced to the UI (FR-303). */
export interface LineAvailability {
  available: number; // current variant stock
  clamped: boolean; // quantity was reduced to fit stock
  outOfStock: boolean; // stock is 0 — line is not purchasable
}

export interface CartLineView {
  id: string;
  productId: string;
  variantId: string;
  slug: string;
  title: string;
  image: { url: string; alt: string | null } | null;
  options: Record<string, string>;
  unitPrice: number; // cents, re-read from the variant — effective (sale) price
  compareAt: number | null; // cents, regular price when a sale is active (else null)
  quantity: number; // effective (clamped) quantity
  lineSubtotal: number; // cents
  availability: LineAvailability;
}

export interface CartCouponView {
  code: string;
  valid: boolean;
  freeShipping: boolean;
  discountCents: number;
  message?: string; // rejection reason when !valid
}

export interface CartView {
  id: string | null;
  items: CartLineView[];
  itemCount: number; // sum of purchasable quantities
  subtotal: number; // cents, before discount/shipping
  coupon: CartCouponView | null;
  automaticDiscounts: AppliedAutomaticDiscount[]; // no-code cart-rule discounts
  discountTotal: number; // cents — coupon + automatic discounts (clamped to subtotal)
  freeShipping: boolean; // any applied promotion waives shipping
  total: number; // cents, subtotal - discount (shipping added at checkout)
}

/** A store shipping zone (shape shared with StoreSetting.shippingZones, script 15). */
interface ShippingZone {
  label: string;
  countries?: string[]; // ISO-2 codes; omitted / empty = matches anywhere
  rateCents: number;
  freeOverCents?: number; // free shipping once subtotal reaches this
}

const DEFAULT_ZONES: ShippingZone[] = [
  { label: 'Standard', rateCents: 500, freeOverCents: 5000 },
];

/**
 * Cart domain (script 09, FR-301..306). One cart per identity (customer `userId`
 * or guest `sessionId`), persisted in Cart/CartItem. Prices are ALWAYS re-read
 * from the current variant on read; quantities are clamped to live stock on both
 * write and read so an over-stock quantity can never persist. Coupon validation
 * is delegated to {@link CouponService} (full engine in script 12); redemption
 * is finalized at payment success, never here.
 */
@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coupon: CouponService,
  ) {}

  // ─────────────────────────── Identity resolution ───────────────────────────

  /** Find-or-create the single cart for a signed-in customer. */
  async getOrCreateUserCart(userId: number) {
    const existing = await this.prisma.cart.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.cart.create({ data: { userId } });
  }

  getUserCart(userId: number) {
    return this.prisma.cart.findUnique({ where: { userId } });
  }

  getSessionCart(sessionId: string) {
    return this.prisma.cart.findUnique({ where: { sessionId } });
  }

  createSessionCart(sessionId: string) {
    return this.prisma.cart.create({ data: { sessionId } });
  }

  // ─────────────────────────── Reads ───────────────────────────

  /** Empty-cart payload for a caller that has no cart yet (no row created). */
  static emptyView(): CartView {
    return {
      id: null,
      items: [],
      itemCount: 0,
      subtotal: 0,
      coupon: null,
      automaticDiscounts: [],
      discountTotal: 0,
      freeShipping: false,
      total: 0,
    };
  }

  /**
   * Build the full cart view: authoritative prices, per-line availability, live
   * stock clamping (persisted), applied-coupon discount, and totals.
   */
  async buildView(cartId: string): Promise<CartView> {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: CART_INCLUDE,
    });
    if (!cart) return CartService.emptyView();

    const { lines, promotionLines, subtotal, itemCount, clamps } =
      this.computeLines(cart);

    // Persist any stock-driven quantity reductions so an over-stock quantity is
    // never left in the database (FR-303).
    for (const c of clamps) {
      await this.prisma.cartItem.update({
        where: { id: c.itemId },
        data: { quantity: c.quantity },
      });
    }

    const coupon = await this.resolveCoupon(
      cart.couponCode,
      subtotal,
      cart.userId,
      promotionLines,
    );
    // Automatic (no-code) cart-rule discounts (FR-603), stacked with the coupon
    // per the precedence documented on CouponService.
    const automaticDiscounts = await this.coupon.evaluateAutomaticDiscounts({
      subtotalCents: subtotal,
      itemCount,
      lines: promotionLines,
    });

    const couponDiscount = coupon?.valid ? coupon.discountCents : 0;
    const autoDiscount = automaticDiscounts.reduce(
      (sum, d) => sum + d.discountCents,
      0,
    );
    // Both are computed on the raw subtotal (never compounded) and clamped.
    const discountTotal = Math.min(subtotal, couponDiscount + autoDiscount);
    const freeShipping =
      (coupon?.valid && coupon.freeShipping) ||
      automaticDiscounts.some((d) => d.freeShipping);

    return {
      id: cart.id,
      items: lines,
      itemCount,
      subtotal,
      coupon,
      automaticDiscounts,
      discountTotal,
      freeShipping,
      total: Math.max(0, subtotal - discountTotal),
    };
  }

  // ─────────────────────────── Mutations ───────────────────────────

  /** Add a variant (or increment an existing line), clamped to stock. */
  async addItem(cartId: string, variantId: string, quantity: number) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, price: true, stock: true, productId: true },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    if (variant.stock <= 0) {
      throw new BadRequestException('This item is out of stock.');
    }

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
      select: { quantity: true },
    });
    const desired = (existing?.quantity ?? 0) + quantity;
    const next = Math.min(desired, variant.stock); // clamp to live stock

    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      create: {
        cartId,
        productId: variant.productId,
        variantId,
        quantity: next,
        unitPriceCents: variant.price,
      },
      update: { quantity: next, unitPriceCents: variant.price },
    });
    await this.touch(cartId);
    return this.buildView(cartId);
  }

  /** Set an absolute quantity for a line (0 removes it), clamped to stock. */
  async updateItem(cartId: string, itemId: string, quantity: number) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId },
      include: { variant: { select: { stock: true, price: true } } },
    });
    if (!item) throw new NotFoundException('Cart item not found');

    const next = Math.min(quantity, item.variant.stock);
    if (next <= 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
    } else {
      await this.prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity: next, unitPriceCents: item.variant.price },
      });
    }
    await this.touch(cartId);
    return this.buildView(cartId);
  }

  async removeItem(cartId: string, itemId: string) {
    const { count } = await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cartId },
    });
    if (count === 0) throw new NotFoundException('Cart item not found');
    await this.touch(cartId);
    return this.buildView(cartId);
  }

  /** Empty the cart (also drops any applied coupon). */
  async clear(cartId: string) {
    await this.prisma.cartItem.deleteMany({ where: { cartId } });
    await this.prisma.cart.update({
      where: { id: cartId },
      data: { couponCode: null, updatedAt: new Date() },
    });
    return this.buildView(cartId);
  }

  // ─────────────────────────── Coupon (FR-304) ───────────────────────────

  /**
   * Apply a coupon: validate against the current subtotal (throws a 400 with a
   * clear message on rejection) and store the accepted code on the cart. No
   * redemption is recorded — that happens at order/payment success (scripts 10/12).
   */
  async applyCoupon(cartId: string, code: string) {
    const { subtotal, promotionLines } = this.computeLines(
      await this.mustLoad(cartId),
    );
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      select: { userId: true },
    });
    // Throws BadRequestException on any validation failure → surfaced to the UI.
    //
    // The LINES matter as much as the subtotal here: a category- or
    // product-scoped coupon is computed against the eligible slice, and
    // CouponService deliberately fails closed when it is not given them. Omit
    // these and every scoped coupon is rejected at the point of use.
    const result = await this.coupon.validate(code, {
      subtotalCents: subtotal,
      userId: cart?.userId,
      lines: promotionLines,
    });
    await this.prisma.cart.update({
      where: { id: cartId },
      data: { couponCode: result.code, updatedAt: new Date() },
    });
    return this.buildView(cartId);
  }

  async removeCoupon(cartId: string) {
    await this.prisma.cart.update({
      where: { id: cartId },
      data: { couponCode: null, updatedAt: new Date() },
    });
    return this.buildView(cartId);
  }

  // ─────────────────────────── Estimated shipping (FR-305) ───────────────────

  /**
   * Cheap, non-authoritative shipping preview from store zones (StoreSetting,
   * script 15). Falls back to a flat default when no zones are configured. A
   * valid FREE_SHIPPING coupon on the cart waives the fee.
   */
  async estimateShipping(cartId: string, address: EstimateShippingDto) {
    const cart = await this.mustLoad(cartId);
    const { subtotal, itemCount, promotionLines } = this.computeLines(cart);

    const zones = await this.loadShippingZones();
    const country = address.country?.toUpperCase();
    const zone =
      zones.find(
        (z) => z.countries?.some((c) => c.toUpperCase() === country) ?? false,
      ) ??
      zones.find((z) => !z.countries || z.countries.length === 0) ??
      zones[0];

    let amountCents = zone.rateCents;
    let label = zone.label;
    if (zone.freeOverCents != null && subtotal >= zone.freeOverCents) {
      amountCents = 0;
      label = `${zone.label} (free over ${this.dollars(zone.freeOverCents)})`;
    }

    // A FREE_SHIPPING coupon waives the fee entirely.
    const coupon = await this.resolveCoupon(
      cart.couponCode,
      subtotal,
      cart.userId,
      promotionLines,
    );
    if (coupon?.valid && coupon.freeShipping) {
      amountCents = 0;
      label = 'Free shipping (coupon)';
    }

    // …as does an automatic free-shipping discount (FR-603).
    if (amountCents > 0) {
      const autos = await this.coupon.evaluateAutomaticDiscounts({
        subtotalCents: subtotal,
        itemCount,
        lines: promotionLines,
      });
      if (autos.some((d) => d.freeShipping)) {
        amountCents = 0;
        label = 'Free shipping (promotion)';
      }
    }

    return { amountCents, label, currency: 'USD', subtotal };
  }

  // ─────────────────────────── Merge on login (FR-301) ───────────────────────

  /**
   * Merge a guest cart into the customer's cart after login. Idempotent and safe
   * when the customer has no cart (adopt the guest cart) or the guest cart is
   * empty (no-op). Quantities are summed per variant and capped at live stock;
   * the guest cart is deleted afterward.
   */
  async mergeGuestCartIntoUser(
    sessionId: string,
    userId: number,
  ): Promise<void> {
    const guest = await this.prisma.cart.findUnique({
      where: { sessionId },
      include: { items: true },
    });
    if (!guest) return;

    if (guest.items.length === 0) {
      await this.prisma.cart.delete({ where: { id: guest.id } });
      return;
    }

    const userCart = await this.prisma.cart.findUnique({ where: { userId } });

    // No existing customer cart → adopt the guest cart wholesale, then clamp.
    if (!userCart) {
      await this.prisma.cart.update({
        where: { id: guest.id },
        data: { userId, sessionId: null, updatedAt: new Date() },
      });
      await this.clampAll(guest.id);
      return;
    }

    // Existing customer cart → fold each guest line in, summed + stock-capped.
    const variantIds = guest.items.map((i) => i.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, stock: true, price: true },
    });
    const stockById = new Map(variants.map((v) => [v.id, v]));

    for (const gi of guest.items) {
      const v = stockById.get(gi.variantId);
      if (!v || v.stock <= 0) continue;
      const existing = await this.prisma.cartItem.findUnique({
        where: {
          cartId_variantId: { cartId: userCart.id, variantId: gi.variantId },
        },
        select: { quantity: true },
      });
      const capped = Math.min((existing?.quantity ?? 0) + gi.quantity, v.stock);
      if (capped <= 0) continue;
      await this.prisma.cartItem.upsert({
        where: {
          cartId_variantId: { cartId: userCart.id, variantId: gi.variantId },
        },
        create: {
          cartId: userCart.id,
          productId: gi.productId,
          variantId: gi.variantId,
          quantity: capped,
          unitPriceCents: v.price,
        },
        update: { quantity: capped, unitPriceCents: v.price },
      });
    }

    await this.prisma.cart.delete({ where: { id: guest.id } }); // cascades items
    await this.touch(userCart.id);
  }

  // ─────────────────────────── Abandoned carts (FR-306) ──────────────────────

  /**
   * Find non-empty carts idle past the abandonment thresholds and return the due
   * set with a stage marker + email trigger point. Callable now; the scheduled
   * job and actual send are wired in script 16 (no cron added here).
   */
  async markAbandonedCarts(now: Date = new Date()) {
    const firstCutoff = new Date(now.getTime() - ABANDONED_FIRST_MS);
    const finalCutoff = new Date(now.getTime() - ABANDONED_FINAL_MS);

    const carts = await this.prisma.cart.findMany({
      where: { updatedAt: { lt: firstCutoff }, items: { some: {} } },
      include: {
        user: { select: { id: true, email: true } },
        items: { select: { id: true } },
      },
    });

    const due = carts.map((c) => ({
      cartId: c.id,
      userId: c.userId,
      email: c.user?.email ?? null, // guest carts have no address to email
      itemCount: c.items.length,
      updatedAt: c.updatedAt,
      stage: c.updatedAt < finalCutoff ? 'final' : 'first',
      notifiable: Boolean(c.user?.email),
    }));

    this.logger.log(
      `markAbandonedCarts: ${due.length} due (${due.filter((d) => d.notifiable).length} notifiable). Email send wired in script 16.`,
    );
    return due;
  }

  // ─────────────────────────── Internals ───────────────────────────

  /** Load a cart (with items) or throw — used by mutating helpers. */
  private async mustLoad(cartId: string): Promise<CartWithItems> {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: CART_INCLUDE,
    });
    if (!cart) throw new NotFoundException('Cart not found');
    return cart;
  }

  /** Pure line computation: view rows, subtotal, item count, pending clamps. */
  private computeLines(cart: CartWithItems): {
    lines: CartLineView[];
    /**
     * The same lines reduced to what the promotions engine needs. Built here
     * rather than derived later because this is the one place that already
     * knows each line's stock-clamped quantity and sale-aware unit price —
     * recomputing either downstream is how the two drift apart.
     */
    promotionLines: PromotionLine[];
    subtotal: number;
    itemCount: number;
    clamps: { itemId: string; quantity: number }[];
  } {
    const lines: CartLineView[] = [];
    const promotionLines: PromotionLine[] = [];
    const clamps: { itemId: string; quantity: number }[] = [];
    let subtotal = 0;
    let itemCount = 0;

    for (const item of cart.items) {
      const stock = item.variant.stock;
      const outOfStock = stock <= 0;
      const clampedQty = Math.max(0, Math.min(item.quantity, stock));
      // Effective (purchasable) quantity used for totals.
      const effectiveQty = outOfStock ? 0 : clampedQty;
      // Authoritative re-read, honoring any active scheduled sale (FR-604).
      const unitPrice = effectivePriceCents(item.variant);
      const compareAt = compareAtWhenOnSale(item.variant);
      const lineSubtotal = unitPrice * effectiveQty;

      // A quantity above stock (but stock > 0) must be persisted back down.
      if (!outOfStock && clampedQty !== item.quantity) {
        clamps.push({ itemId: item.id, quantity: clampedQty });
      }

      subtotal += lineSubtotal;
      itemCount += effectiveQty;

      promotionLines.push({
        productId: item.productId,
        categoryId: item.variant.product.categoryId,
        quantity: effectiveQty,
        lineTotalCents: lineSubtotal,
        onSale: isSaleActive(item.variant),
      });

      lines.push({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        slug: item.variant.product.slug,
        title: item.variant.product.title,
        image: item.variant.product.images[0] ?? null,
        options: (item.variant.options as Record<string, string>) ?? {},
        unitPrice,
        compareAt,
        quantity: outOfStock ? item.quantity : clampedQty,
        lineSubtotal,
        availability: {
          available: Math.max(0, stock),
          clamped: !outOfStock && clampedQty !== item.quantity,
          outOfStock,
        },
      });
    }

    return { lines, promotionLines, subtotal, itemCount, clamps };
  }

  /** Re-validate a stored coupon code against the current subtotal (safe). */
  private async resolveCoupon(
    code: string | null,
    subtotal: number,
    userId: number | null,
    lines: PromotionLine[],
  ): Promise<CartCouponView | null> {
    if (!code) return null;
    try {
      const r = await this.coupon.validate(code, {
        subtotalCents: subtotal,
        userId,
        lines,
      });
      return {
        code: r.code,
        valid: true,
        freeShipping: r.freeShipping,
        discountCents: r.discountCents,
      };
    } catch (err) {
      // Stored code no longer applies (expired, min-order not met, etc.). Show it
      // as invalid rather than silently dropping so the shopper sees why.
      return {
        code,
        valid: false,
        freeShipping: false,
        discountCents: 0,
        message:
          err instanceof BadRequestException
            ? ((err.getResponse() as { message?: string })?.message ??
              'Coupon no longer valid.')
            : 'Coupon no longer valid.',
      };
    }
  }

  /** Clamp every line of a cart down to live stock (used after adopting). */
  private async clampAll(cartId: string): Promise<void> {
    const items = await this.prisma.cartItem.findMany({
      where: { cartId },
      include: { variant: { select: { stock: true } } },
    });
    for (const item of items) {
      const stock = item.variant.stock;
      if (stock <= 0) {
        await this.prisma.cartItem.delete({ where: { id: item.id } });
      } else if (item.quantity > stock) {
        await this.prisma.cartItem.update({
          where: { id: item.id },
          data: { quantity: stock },
        });
      }
    }
  }

  /**
   * Bump the cart's updatedAt so abandoned-cart detection stays accurate, and
   * reset the recovery stage (script 16, FR-306) — a cart the shopper just
   * changed is active again and should re-arm both the 1h and 24h nudges.
   */
  private touch(cartId: string) {
    return this.prisma.cart.update({
      where: { id: cartId },
      data: { updatedAt: new Date(), recoveryStage: 0 },
    });
  }

  private async loadShippingZones(): Promise<ShippingZone[]> {
    const setting = await this.prisma.storeSetting.findFirst({
      where: { singleton: true },
      select: { shippingZones: true },
    });
    const raw = setting?.shippingZones;
    if (Array.isArray(raw)) {
      const zones = (raw as unknown[]).filter(
        (z): z is ShippingZone =>
          !!z &&
          typeof z === 'object' &&
          typeof (z as ShippingZone).label === 'string' &&
          typeof (z as ShippingZone).rateCents === 'number',
      );
      if (zones.length) return zones;
    }
    return DEFAULT_ZONES;
  }

  private dollars(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }
}
