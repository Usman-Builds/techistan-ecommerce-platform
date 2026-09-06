import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import { NotificationService } from './notification.service';
import { SmsService } from './sms.service';

/** Minimal order shape needed to build a confirmation receipt. */
export interface OrderForConfirmation {
  id: string;
  orderNumber: string;
  email: string;
  userId: number | null;
  currency: string;
  subtotal: number;
  shippingTotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  items: {
    productTitle: string;
    variantOptions: unknown;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
}

interface OrderRef {
  id: string;
  orderNumber: string;
  email: string;
  userId: number | null;
}

/**
 * Domain-event façade (script 16). The ONE seam every domain service calls to
 * "notify" — it fans a single business event out to (a) the customer's inbox +
 * in-app bell and (b) the admin bell + optional admin inbox, keeping that policy
 * in one place. Never throws: the underlying EmailService/NotificationService
 * both isolate their own failures, and each method is additionally guarded.
 *
 * @Global via NotificationModule, so order/payment/review/inventory/auth inject
 * it without importing the module.
 */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  constructor(
    private readonly email: EmailService,
    private readonly notifications: NotificationService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────── Auth ──────────────────────────────────────

  async welcome(user: { email: string; firstName: string | null }): Promise<void> {
    await this.email.sendWelcome(user.email, user.firstName);
  }

  // ────────────────────────────── Orders ─────────────────────────────────────

  /** Order confirmed on payment success: receipt email + customer & admin bells. */
  async orderConfirmed(order: OrderForConfirmation): Promise<void> {
    try {
      await this.email.sendOrderConfirmation(order.email, {
        firstName: null,
        orderNumber: order.orderNumber,
        currency: order.currency,
        items: order.items.map((i) => ({
          title: i.productTitle,
          variant: formatVariant(i.variantOptions),
          quantity: i.quantity,
          unitPriceCents: i.unitPrice,
          lineTotalCents: i.total,
        })),
        subtotalCents: order.subtotal,
        shippingCents: order.shippingTotal,
        taxCents: order.taxTotal,
        discountCents: order.discountTotal,
        totalCents: order.grandTotal,
      });

      if (order.userId != null) {
        await this.notifications.create({
          userId: order.userId,
          type: 'ORDER_CONFIRMED',
          title: `Order ${order.orderNumber} confirmed`,
          body: 'Thanks for your order — we’re getting it ready.',
          data: { orderId: order.id, orderNumber: order.orderNumber },
        });
      }

      // Admin alert: new order.
      await this.notifications.createForAdmins({
        type: 'ADMIN_NEW_ORDER',
        title: `New order ${order.orderNumber}`,
        body: `A new order was placed for ${order.email}.`,
        data: { orderId: order.id, orderNumber: order.orderNumber },
      });
      await this.adminEmail({
        subject: `New order ${order.orderNumber}`,
        heading: 'New order received',
        message: `Order ${order.orderNumber} was placed by ${order.email}.`,
        ctaLabel: 'Open order',
        ctaUrl: `${this.email.adminUrl()}/orders/${order.id}`,
      });
    } catch (err) {
      this.warn('orderConfirmed', err);
    }
  }

  /** Shipment created: tracking email + customer bell (+ optional SMS). */
  async orderShipped(
    order: OrderRef,
    shipment: { carrier: string; trackingNumber: string; trackingUrl: string | null },
  ): Promise<void> {
    try {
      await this.email.sendShipping(order.email, {
        orderNumber: order.orderNumber,
        ...shipment,
      });
      if (order.userId != null) {
        await this.notifications.create({
          userId: order.userId,
          type: 'ORDER_SHIPPED',
          title: `Order ${order.orderNumber} shipped`,
          body: `On its way via ${shipment.carrier} (#${shipment.trackingNumber}).`,
          data: { orderId: order.id, orderNumber: order.orderNumber },
        });
      }
      this.sms.sendSms(
        order.email,
        `Your order ${order.orderNumber} has shipped via ${shipment.carrier}.`,
      );
    } catch (err) {
      this.warn('orderShipped', err);
    }
  }

  /** Lifecycle transition (FR-501). Emails delivered/completed/cancelled; the
   *  in-app bell fires for every transition so customers can track progress. */
  async orderStatusChanged(order: OrderRef, status: string): Promise<void> {
    try {
      if (order.userId != null) {
        await this.notifications.create({
          userId: order.userId,
          type: 'ORDER_STATUS',
          title: `Order ${order.orderNumber} is now ${humanStatus(status)}`,
          data: { orderId: order.id, orderNumber: order.orderNumber, status },
        });
      }
      const copy = statusEmailCopy(status, order.orderNumber);
      if (copy) {
        await this.email.sendOrderStatus(order.email, {
          orderNumber: order.orderNumber,
          ...copy,
        });
      }
    } catch (err) {
      this.warn('orderStatusChanged', err);
    }
  }

  /** Refund processed: email + customer bell. */
  async refundProcessed(
    order: OrderRef,
    refund: { amountCents: number; currency: string },
  ): Promise<void> {
    try {
      await this.email.sendRefund(order.email, {
        orderNumber: order.orderNumber,
        amountCents: refund.amountCents,
        currency: refund.currency,
      });
      if (order.userId != null) {
        await this.notifications.create({
          userId: order.userId,
          type: 'ORDER_REFUNDED',
          title: `Refund processed for ${order.orderNumber}`,
          data: { orderId: order.id, orderNumber: order.orderNumber },
        });
      }
    } catch (err) {
      this.warn('refundProcessed', err);
    }
  }

  /** Return request update (requested/approved/rejected): email + customer bell. */
  async returnUpdated(order: OrderRef, status: string): Promise<void> {
    try {
      const headline = `Return ${status.toLowerCase()} for ${order.orderNumber}`;
      await this.email.sendOrderStatus(order.email, {
        subject: headline,
        orderNumber: order.orderNumber,
        headline,
        message: `Your return request for order ${order.orderNumber} is now ${status.toLowerCase()}.`,
      });
      if (order.userId != null) {
        await this.notifications.create({
          userId: order.userId,
          type: 'ORDER_RETURN',
          title: headline,
          data: { orderId: order.id, orderNumber: order.orderNumber, status },
        });
      }
    } catch (err) {
      this.warn('returnUpdated', err);
    }
  }

  // ────────────────────────────── Admin ──────────────────────────────────────

  /** New review submitted → admin moderation bell (+ optional admin email). */
  async newReview(review: {
    productId: string;
    productTitle: string;
    rating: number;
    reviewId: string;
  }): Promise<void> {
    try {
      await this.notifications.createForAdmins({
        type: 'ADMIN_NEW_REVIEW',
        title: `New ${review.rating}★ review awaiting moderation`,
        body: `"${review.productTitle}" received a new review.`,
        data: { reviewId: review.reviewId, productId: review.productId },
      });
      await this.adminEmail({
        subject: 'New review awaiting moderation',
        heading: 'New review submitted',
        message: `"${review.productTitle}" received a ${review.rating}★ review awaiting moderation.`,
        ctaLabel: 'Moderate reviews',
        ctaUrl: `${this.email.adminUrl()}/reviews`,
      });
    } catch (err) {
      this.warn('newReview', err);
    }
  }

  /** Stock crossed the low-stock threshold → admin inventory bell (+ email). */
  async lowStock(variant: {
    variantId: string;
    productId: string;
    productTitle: string;
    sku: string;
    stock: number;
    threshold: number;
  }): Promise<void> {
    try {
      await this.notifications.createForAdmins({
        type: 'ADMIN_LOW_STOCK',
        title: `Low stock: ${variant.productTitle}`,
        body: `${variant.sku} is down to ${variant.stock} (threshold ${variant.threshold}).`,
        data: {
          productId: variant.productId,
          variantId: variant.variantId,
          stock: variant.stock,
        },
      });
      await this.adminEmail({
        subject: `Low stock: ${variant.productTitle}`,
        heading: 'Low stock alert',
        message: `${variant.productTitle} (${variant.sku}) is down to ${variant.stock} units, at or below the ${variant.threshold} threshold.`,
        ctaLabel: 'Open inventory',
        ctaUrl: `${this.email.adminUrl()}/inventory`,
      });
    } catch (err) {
      this.warn('lowStock', err);
    }
  }

  // ───────────────────────────── Internals ───────────────────────────────────

  /** Send an admin email only when ADMIN_EMAIL_ALERTS=true and a recipient exists. */
  private async adminEmail(data: {
    subject: string;
    heading: string;
    message: string;
    ctaLabel?: string;
    ctaUrl?: string;
  }): Promise<void> {
    const enabled = this.config.get<boolean>('email.adminAlerts') ?? false;
    const to = this.config.get<string>('email.adminEmail');
    if (!enabled || !to) return;
    await this.email.sendAdminAlert(to, data);
  }

  private warn(where: string, err: unknown): void {
    this.logger.warn(
      `notifier.${where} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─────────────────────────────── Helpers ─────────────────────────────────────

function formatVariant(options: unknown): string | null {
  if (!options || typeof options !== 'object') return null;
  const entries = Object.entries(options as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(', ');
}

function humanStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

/** Only a few transitions warrant an email; the rest are in-app only. */
function statusEmailCopy(
  status: string,
  orderNumber: string,
): { subject: string; headline: string; message: string } | null {
  switch (status) {
    case 'DELIVERED':
      return {
        subject: `Order ${orderNumber} delivered`,
        headline: 'Your order was delivered 🎉',
        message: `Order ${orderNumber} has been delivered. We hope you love it!`,
      };
    case 'COMPLETED':
      return {
        subject: `Order ${orderNumber} complete`,
        headline: 'Your order is complete',
        message: `Order ${orderNumber} is now complete. Thank you for shopping with us!`,
      };
    case 'CANCELLED':
      return {
        subject: `Order ${orderNumber} cancelled`,
        headline: 'Your order was cancelled',
        message: `Order ${orderNumber} has been cancelled. If this is unexpected, please contact support.`,
      };
    default:
      return null;
  }
}
