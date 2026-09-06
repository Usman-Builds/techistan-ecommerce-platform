import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CouponService } from '../coupon/coupon.service';
import {
  NotifierService,
  OrderForConfirmation,
} from '../notification/notifier.service';
import { STRIPE_CLIENT } from './stripe.provider';

interface CreateIntentInput {
  orderId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  /** Passed to Stripe so a retried order submission reuses the same intent. */
  idempotencyKey?: string;
}

/**
 * Payment domain (script 10, FR-406/410/413/414). All Stripe calls funnel through
 * here; the client only ever handles a PaymentIntent `clientSecret` (NFR-207 — no
 * card data touches this server). The webhook (verified against the raw body) is
 * the single source of truth for payment state: it confirms the order, decrements
 * stock, finalizes coupon redemption, and clears the cart — exactly once per
 * event, deduped through {@link ProcessedWebhookEvent}.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly coupon: CouponService,
    private readonly audit: AuditService,
    private readonly notifier: NotifierService,
  ) {
    // The webhook is the ONLY thing that confirms an order. Without a secret we
    // reject every delivery, so a paid order silently sits in PENDING forever
    // and the shopper stares at "Payment processing…". Joi allows this outside
    // production (so the app boots before keys are wired), which makes a boot
    // warning the only signal — same treatment EmailService gives RESEND_API_KEY.
    if (!this.config.get<string>('stripe.webhookSecret')) {
      this.logger.warn(
        'STRIPE_WEBHOOK_SECRET is not set — webhooks will be rejected and paid ' +
          'orders will stay PENDING. Run: stripe listen --forward-to ' +
          'localhost:3000/payments/webhook',
      );
    }
  }

  /** The Stripe client, or a clear 503 when no secret key is configured. */
  private client(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Payments are not configured. Set STRIPE_SECRET_KEY to enable checkout.',
      );
    }
    return this.stripe;
  }

  // ─────────────────────────── PaymentIntents (FR-410) ───────────────────────

  /**
   * Create (or reuse) a Stripe PaymentIntent for an order and persist its id on
   * the pending Payment row. Automatic payment methods are enabled so the client
   * Payment Element can offer cards, Apple Pay, and Google Pay. Returns the
   * client secret the browser needs to confirm payment.
   */
  async createIntent(input: CreateIntentInput): Promise<{ clientSecret: string }> {
    const stripe = this.client();
    const intent = await stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: input.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: input.orderId },
      },
      // Stripe-level idempotency: a retried POST /orders with the same key returns
      // the same PaymentIntent instead of creating a duplicate.
      input.idempotencyKey
        ? { idempotencyKey: `pi_${input.idempotencyKey}` }
        : undefined,
    );

    await this.prisma.payment.update({
      where: { id: input.paymentId },
      data: {
        stripePaymentIntentId: intent.id,
        status: PaymentStatus.PROCESSING,
      },
    });

    if (!intent.client_secret) {
      throw new ServiceUnavailableException(
        'Stripe did not return a client secret.',
      );
    }
    return { clientSecret: intent.client_secret };
  }

  /** Fetch the client secret for an already-created intent (idempotent re-submit). */
  async getClientSecret(paymentIntentId: string): Promise<string | null> {
    const intent = await this.client().paymentIntents.retrieve(paymentIntentId);
    return intent.client_secret ?? null;
  }

  // ─────────────────────────── Webhook (FR-414) ──────────────────────────────

  /** Verify a webhook signature against the raw body; throws on any mismatch. */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = this.config.get<string>('stripe.webhookSecret');
    if (!secret) {
      throw new ServiceUnavailableException('Webhook secret not configured.');
    }
    try {
      return this.client().webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      throw new BadRequestException(
        `Webhook signature verification failed: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }
  }

  /** Dispatch a verified event. Unknown types are acknowledged and ignored. */
  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onPaymentSucceeded(event);
        break;
      case 'payment_intent.payment_failed':
        await this.onPaymentFailed(event);
        break;
      default:
        this.logger.debug(`Ignoring unhandled event type: ${event.type}`);
    }
  }

  /**
   * Confirm an order on payment success — all-or-nothing in one transaction that
   * also inserts the event id, so Stripe redelivery (or a concurrent duplicate)
   * can never double-decrement stock or double-record a redemption.
   */
  private async onPaymentSucceeded(event: Stripe.Event): Promise<void> {
    const intent = event.data.object as Stripe.PaymentIntent;
    let confirmed: OrderForConfirmation | null = null;
    try {
      confirmed = await this.prisma.$transaction(async (tx) => {
        // Idempotency anchor: unique PK → throws P2002 on a duplicate event.
        await tx.processedWebhookEvent.create({
          data: { id: event.id, type: event.type },
        });

        const payment = await tx.payment.findUnique({
          where: { stripePaymentIntentId: intent.id },
          include: { order: { include: { items: true } } },
        });
        if (!payment) {
          this.logger.warn(
            `payment_intent.succeeded for unknown intent ${intent.id}.`,
          );
          return null;
        }
        const order = payment.order;

        // Defensive guard: never re-apply side effects to an already-paid order.
        if (payment.status === PaymentStatus.SUCCEEDED) return null;

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCEEDED,
            method: intent.payment_method_types?.[0] ?? payment.method,
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.CONFIRMED },
        });

        // Decrement stock now (not at order creation) — the sale is real.
        for (const item of order.items) {
          if (!item.variantId) continue;
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { decrement: item.quantity } },
          });
        }

        // Finalize coupon redemption + clear the originating cart.
        if (order.couponCode) {
          await this.coupon.recordRedemption(
            tx,
            order.couponCode,
            order.id,
            order.userId,
          );
        }
        if (order.cartId) {
          await tx.cartItem.deleteMany({ where: { cartId: order.cartId } });
          await tx.cart.updateMany({
            where: { id: order.cartId },
            data: { couponCode: null },
          });
        }

        this.logger.log(
          `Order ${order.orderNumber} CONFIRMED (intent ${intent.id}).`,
        );

        // Return the receipt data so the confirmation email + new-order alert are
        // fired AFTER the transaction commits (never inside it).
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          email: order.email,
          userId: order.userId,
          currency: order.currency,
          subtotal: order.subtotal,
          shippingTotal: order.shippingTotal,
          taxTotal: order.taxTotal,
          discountTotal: order.discountTotal,
          grandTotal: order.grandTotal,
          items: order.items.map((i) => ({
            productTitle: i.productTitle,
            variantOptions: i.variantOptions,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.total,
          })),
        } satisfies OrderForConfirmation;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.debug(`Duplicate webhook event ${event.id} ignored.`);
        return;
      }
      throw err;
    }

    // Post-commit: confirmation receipt + admin new-order alert (best-effort).
    if (confirmed) {
      void this.notifier.orderConfirmed(confirmed);
    }
  }

  /**
   * Mark a failed payment. The order is left PENDING (not cancelled) so the
   * shopper can retry from the recovery path with a fresh attempt; stock was
   * never decremented, so nothing to release.
   */
  private async onPaymentFailed(event: Stripe.Event): Promise<void> {
    const intent = event.data.object as Stripe.PaymentIntent;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.processedWebhookEvent.create({
          data: { id: event.id, type: event.type },
        });
        const payment = await tx.payment.findUnique({
          where: { stripePaymentIntentId: intent.id },
        });
        if (!payment) return;
        if (payment.status === PaymentStatus.SUCCEEDED) return; // already paid
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        });
        this.logger.warn(
          `Payment failed for intent ${intent.id} (order ${payment.orderId}).`,
        );
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return;
      }
      throw err;
    }
  }

  // ─────────────────────────── Refunds (FR-413) ──────────────────────────────

  /**
   * Full or partial refund via Stripe. Omit `amountCents` for a full refund of
   * the remaining refundable balance. Updates the Payment (refundedAmount +
   * status) and Order status, and writes an audit entry.
   */
  async processRefund(
    orderId: string,
    amountCents: number | undefined,
    actorId: number | null,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const payment = order.payments.find(
      (p) => p.status === PaymentStatus.SUCCEEDED || p.refundedAmount > 0,
    );
    if (!payment || !payment.stripePaymentIntentId) {
      throw new BadRequestException('This order has no captured payment to refund.');
    }

    const refundable = payment.amount - payment.refundedAmount;
    if (refundable <= 0) {
      throw new BadRequestException('This payment is already fully refunded.');
    }
    const amount = amountCents ?? refundable;
    if (amount > refundable) {
      throw new BadRequestException(
        `Refund exceeds the refundable amount (${refundable} cents remaining).`,
      );
    }

    const refund = await this.client().refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount, // always specify cents so partial refunds are exact
    });

    const refundedTotal = payment.refundedAmount + amount;
    const fullyRefunded = refundedTotal >= payment.amount;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmount: refundedTotal,
          status: fullyRefunded
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: fullyRefunded ? { status: OrderStatus.REFUNDED } : {},
      });
    });

    await this.audit.record({
      actorId,
      action: 'order.refund',
      entityType: 'Order',
      entityId: order.id,
      metadata: {
        amountCents: amount,
        refundedTotal,
        fullyRefunded,
        stripeRefundId: refund.id,
      },
    });

    // Notify the customer their refund is on the way (email + in-app bell).
    void this.notifier.refundProcessed(
      { id: order.id, orderNumber: order.orderNumber, email: order.email, userId: order.userId },
      { amountCents: amount, currency: order.currency },
    );

    return {
      orderId: order.id,
      refundId: refund.id,
      amountCents: amount,
      refundedTotal,
      fullyRefunded,
    };
  }
}
