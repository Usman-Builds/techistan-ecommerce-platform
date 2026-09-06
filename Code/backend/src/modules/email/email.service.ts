import * as React from 'react';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { PrismaService } from '../../prisma/prisma.service';
import { cldUrl } from '../media/media.util';
import {
  AbandonedCart,
  AdminAlert,
  EmailBranding,
  OrderConfirmation,
  OrderConfirmationProps,
  OrderStatus,
  PasswordReset,
  Refund,
  ShippingUpdate,
  VerifyEmail,
  Welcome,
} from './templates';

/** A queued email job. `react` is a rendered-to-HTML React Email element. */
export interface EmailJob {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
}

/**
 * Transactional email transport (script 16, FR-901/903/NFR-405).
 *
 * Wraps Resend + React Email. Callers NEVER touch Resend directly — they go
 * through {@link enqueueEmail}, which renders, dispatches, and (critically) never
 * throws back into the originating flow (checkout, registration, order update).
 * The transport is deliberately behind one seam so it can move to a real queue/
 * worker (BullMQ/Redis) later without changing a single caller (see TODO below).
 *
 * When RESEND_API_KEY is unset (dev/test) every send is logged instead of
 * dispatched, so the whole app is exercisable without a provider.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const key = this.config.get<string>('email.resendApiKey');
    this.resend = key ? new Resend(key) : null;
    this.from =
      this.config.get<string>('email.from') ||
      'Techistan <noreply@techistan.dev>';
    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY is not set — emails will be logged, not sent.',
      );
    }
  }

  // ─────────────────────────── Transport (NFR-405) ───────────────────────────

  /**
   * Render + dispatch a job. Isolates ALL failures: a Resend outage or a bad
   * template must never break the flow that triggered the email. Returns a
   * best-effort boolean for tests/telemetry.
   *
   * TODO(queue): replace the inline send with a BullMQ producer + worker and add
   * exponential backoff retry. Callers already depend only on this method, so the
   * swap is transport-local.
   */
  async enqueueEmail(job: EmailJob): Promise<boolean> {
    try {
      const html = await render(job.react);
      if (!this.resend) {
        this.logger.log(
          `[email:dry-run] → ${Array.isArray(job.to) ? job.to.join(', ') : job.to} :: ${job.subject}`,
        );
        return true;
      }
      const { error } = await this.resend.emails.send({
        from: this.from,
        to: job.to,
        subject: job.subject,
        html,
        replyTo: job.replyTo,
      });
      if (error) {
        this.logger.error(`Resend rejected "${job.subject}": ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      // Never rethrow — the originating flow must complete regardless.
      this.logger.error(
        `Failed to send "${job.subject}": ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /** Lower-level escape hatch (kept public per the script's `sendEmail` API). */
  sendEmail(job: EmailJob): Promise<boolean> {
    return this.enqueueEmail(job);
  }

  // ─────────────────────────── Typed send methods ────────────────────────────

  async sendVerification(to: string, verifyUrl: string): Promise<void> {
    const branding = await this.loadBranding();
    void this.enqueueEmail({
      to,
      subject: `Confirm your ${branding.storeName} email`,
      react: React.createElement(VerifyEmail, { branding, verifyUrl }),
    });
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const branding = await this.loadBranding();
    void this.enqueueEmail({
      to,
      subject: 'Reset your password',
      react: React.createElement(PasswordReset, { branding, resetUrl }),
    });
  }

  async sendWelcome(to: string, firstName: string | null): Promise<void> {
    const branding = await this.loadBranding();
    void this.enqueueEmail({
      to,
      subject: `Welcome to ${branding.storeName}`,
      react: React.createElement(Welcome, {
        branding,
        firstName,
        shopUrl: `${this.userUrl()}/products`,
      }),
    });
  }

  async sendOrderConfirmation(
    to: string,
    props: Omit<OrderConfirmationProps, 'branding' | 'orderUrl'>,
  ): Promise<void> {
    const branding = await this.loadBranding();
    void this.enqueueEmail({
      to,
      subject: `Order ${props.orderNumber} confirmed`,
      react: React.createElement(OrderConfirmation, {
        ...props,
        branding,
        orderUrl: this.orderUrl(props.orderNumber),
      }),
    });
  }

  async sendShipping(
    to: string,
    data: {
      orderNumber: string;
      carrier: string;
      trackingNumber: string;
      trackingUrl: string | null;
    },
  ): Promise<void> {
    const branding = await this.loadBranding();
    void this.enqueueEmail({
      to,
      subject: `Your order ${data.orderNumber} has shipped`,
      react: React.createElement(ShippingUpdate, {
        branding,
        ...data,
        orderUrl: this.orderUrl(data.orderNumber),
      }),
    });
  }

  async sendOrderStatus(
    to: string,
    data: { orderNumber: string; headline: string; message: string; subject: string },
  ): Promise<void> {
    const branding = await this.loadBranding();
    void this.enqueueEmail({
      to,
      subject: data.subject,
      react: React.createElement(OrderStatus, {
        branding,
        orderNumber: data.orderNumber,
        headline: data.headline,
        message: data.message,
        orderUrl: this.orderUrl(data.orderNumber),
      }),
    });
  }

  async sendRefund(
    to: string,
    data: { orderNumber: string; amountCents: number; currency: string },
  ): Promise<void> {
    const branding = await this.loadBranding();
    void this.enqueueEmail({
      to,
      subject: `Refund processed for order ${data.orderNumber}`,
      react: React.createElement(Refund, {
        branding,
        ...data,
        orderUrl: this.orderUrl(data.orderNumber),
      }),
    });
  }

  async sendAbandonedCart(
    to: string,
    data: { firstName: string | null; itemCount: number },
  ): Promise<void> {
    const branding = await this.loadBranding();
    void this.enqueueEmail({
      to,
      subject: `You left ${data.itemCount} ${data.itemCount === 1 ? 'item' : 'items'} in your cart`,
      react: React.createElement(AbandonedCart, {
        branding,
        ...data,
        cartUrl: `${this.userUrl()}/cart`,
      }),
    });
  }

  async sendAdminAlert(
    to: string | string[],
    data: { subject: string; heading: string; message: string; ctaLabel?: string; ctaUrl?: string },
  ): Promise<void> {
    const branding = await this.loadBranding();
    void this.enqueueEmail({
      to,
      subject: data.subject,
      react: React.createElement(AdminAlert, {
        branding,
        heading: data.heading,
        message: data.message,
        ctaLabel: data.ctaLabel,
        ctaUrl: data.ctaUrl,
      }),
    });
  }

  // ──────────────────────────────── URLs ─────────────────────────────────────

  userUrl(): string {
    return (this.config.get<string>('userAppUrl') || 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
  }

  adminUrl(): string {
    return (this.config.get<string>('adminAppUrl') || 'http://localhost:3002').replace(
      /\/$/,
      '',
    );
  }

  private orderUrl(orderNumber: string): string {
    return `${this.userUrl()}/account/orders/${orderNumber}`;
  }

  // ──────────────────────────── Branding loader ──────────────────────────────

  /** Pull store chrome (name/logo/contact) from the singleton for every send. */
  private async loadBranding(): Promise<EmailBranding> {
    const setting = await this.prisma.storeSetting.findFirst({
      where: { singleton: true },
    });
    const storeName = setting?.name ?? 'Techistan';
    const cloudName = this.config.get<string>('cloudinary.cloudName');
    const logoUrl =
      setting?.logoPublicId && cloudName
        ? cldUrl(cloudName, setting.logoPublicId, { w: 240 })
        : null;
    return {
      storeName,
      logoUrl,
      contactEmail: setting?.contactEmail ?? null,
      address: `${storeName} · This is a transactional message about your account or order.`,
      manageUrl: `${this.userUrl()}/account/notifications`,
    };
  }
}
