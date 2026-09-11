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
 * Payment states a success may move out of. FAILED is included because a
 * declined card can be retried on the same intent.
 */
const UNPAID_STATUSES = [
  PaymentStatus.REQUIRES_PAYMENT,
  PaymentStatus.PROCESSING,
  PaymentStatus.FAILED,
];

/** Minimum gap between Stripe lookups for one intent while its order is polled. */
export const RECONCILE_INTERVAL_MS = 5_000;

/**
 * Payment domain (script 10, FR-406/410/413/414). All Stripe calls funnel through
 * here; the client only ever handles a PaymentIntent `clientSecret` (NFR-207 — no
 * card data touches this server). The webhook (verified against the raw body) is
 * the primary source of payment state, and {@link PaymentService.reconcile} reads
 * the same state from Stripe's API when the webhook is missing or late. Either
 * path confirms the order, decrements stock, finalizes coupon redemption, and
 * clears the cart — exactly once.
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
    // Without a secret we reject every webhook delivery, so a paid order only
    // confirms when a client happens to poll it (reconcile). An order whose tab
    // was closed stays PENDING. Joi allows this outside production (so the app
    // boots before keys are wired), which makes a boot warning the only signal —
    // same treatment EmailService gives RESEND_API_KEY.
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
   * the pending Payment row. Card is the only accepted method, so the Payment
   * Element shows just the card form. Automatic payment methods would instead add
   * whatever the Stripe Dashboard has enabled (Klarna, Link, Cash App, ...).
   * Returns the client secret the browser needs to confirm payment.
   */
  async createIntent(input: CreateIntentInput): Promise<{ clientSecret: string }> {
    const stripe = this.client();
    const intent = await stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: input.currency.toLowerCase(),
        payment_method_types: ['card'],
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

  // ─────────────────────────── Webhook fallback ──────────────────────────────

  private readonly lastReconciled = new Map<string, number>();

  /**
   * Settle a payment from Stripe's API when the webhook has not. Called while a
   * client polls a still-pending order, so the order confirms even when no webhook
   * endpoint is registered, or the delivery hit a sleeping free-plan instance and
   * Stripe's next retry is an hour away. The state still comes from Stripe, never
   * from the browser, and it goes through the same exactly-once guard as the
   * webhook. Best-effort: a Stripe error is logged and the order is left as is.
   *
   * @returns true when this call changed the payment.
   */
  async reconcile(paymentIntentId: string): Promise<boolean> {
    if (!this.stripe) return false;

    // The client polls every 2s; one Stripe lookup per intent per interval is plenty.
    const now = Date.now();
    const last = this.lastReconciled.get(paymentIntentId) ?? 0;
    if (now - last < RECONCILE_INTERVAL_MS) return false;
    this.lastReconciled.set(paymentIntentId, now);
    if (this.lastReconciled.size > 1000) {
      for (const [id, at] of this.lastReconciled) {
        if (now - at >= RECONCILE_INTERVAL_MS) this.lastReconciled.delete(id);
      }
    }

    try {
      const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status === 'succeeded') {
        return await this.markSucceeded(intent);
      }
      if (
        intent.status === 'requires_payment_method' &&
        intent.last_payment_error
      ) {
        return await this.markFailed(intent);
      }
    } catch (err) {
      this.logger.warn(
        `Could not reconcile intent ${paymentIntentId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return false;
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
        await this.markSucceeded(event.data.object, event);
        break;
      case 'payment_intent.payment_failed':
        await this.markFailed(event.data.object, event);
        break;
      default:
        this.logger.debug(`Ignoring unhandled event type: ${event.type}`);
    }
  }

  /**
   * Confirm an order on payment success, all-or-nothing in one transaction. The
   * webhook passes its event, whose id is recorded so a redelivery is ignored;
   * {@link reconcile} passes none. Either way the conditional status update is
   * the exactly-once guard: only one transaction can move the payment out of an
   * unpaid state (a concurrent one waits on the row lock, then matches nothing),
   * so stock and coupon side effects are never applied twice.
   *
   * @returns true when this call confirmed the order.
   */
  private async markSucceeded(
    intent: Stripe.PaymentIntent,
    event?: Stripe.Event,
  ): Promise<boolean> {
    let confirmed: OrderForConfirmation | null = null;
    try {
      confirmed = await this.prisma.$transaction(async (tx) => {
        // Idempotency anchor for redelivery: unique PK → throws P2002 on a duplicate.
        if (event) {
          await tx.processedWebhookEvent.create({
            data: { id: event.id, type: event.type },
          });
        }

        const payment = await tx.payment.findUnique({
          where: { stripePaymentIntentId: intent.id },
          include: { order: { include: { items: true } } },
        });
        if (!payment) {
          this.logger.warn(
            `Payment succeeded for unknown intent ${intent.id}.`,
          );
          return null;
        }
        const order = payment.order;

        const { count } = await tx.payment.updateMany({
          where: { id: payment.id, status: { in: UNPAID_STATUSES } },
          data: {
            status: PaymentStatus.SUCCEEDED,
            method: intent.payment_method_types?.[0] ?? payment.method,
          },
        });
        // Already paid (or refunded): never re-apply side effects.
        if (count === 0) return null;

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
          `Order ${order.orderNumber} CONFIRMED (intent ${intent.id}, ${
            event ? 'webhook' : 'reconciled'
          }).`,
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
        this.logger.debug(`Duplicate webhook event ${event?.id} ignored.`);
        return false;
      }
      throw err;
    }

    // Post-commit: confirmation receipt + admin new-order alert (best-effort).
    if (!confirmed) return false;
    void this.notifier.orderConfirmed(confirmed);
    return true;
  }

  /**
   * Mark a failed payment. The order is left PENDING (not cancelled) so the
   * shopper can retry from the recovery path with a fresh attempt; stock was
   * never decremented, so nothing to release. Event handling matches
   * {@link markSucceeded}.
   *
   * @returns true when this call changed the payment.
   */
  private async markFailed(
    intent: Stripe.PaymentIntent,
    event?: Stripe.Event,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (event) {
          await tx.processedWebhookEvent.create({
            data: { id: event.id, type: event.type },
          });
        }
        const payment = await tx.payment.findUnique({
          where: { stripePaymentIntentId: intent.id },
        });
        if (!payment) return false;

        // Never downgrade a payment that already succeeded or was refunded.
        const { count } = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: {
              in: [PaymentStatus.REQUIRES_PAYMENT, PaymentStatus.PROCESSING],
            },
          },
          data: { status: PaymentStatus.FAILED },
        });
        if (count === 0) return false;

        this.logger.warn(
          `Payment failed for intent ${intent.id} (order ${payment.orderId}).`,
        );
        return true;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return false;
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
