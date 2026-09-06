import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Length of the GDPR deletion grace window (FR-114). */
export const DELETION_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Self-service GDPR surface (script 17, CR-005 / FR-114). Everything here is
 * scoped to the *caller's own* userId — never an arbitrary id from the request —
 * so the controller only ever passes `@CurrentUser('userId')`. Covers the data
 * export, the scheduled soft-delete with a 30-day grace window + cancellation,
 * and the anonymize-on-expiry sweep the daily cron drives.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Assemble the caller's personal data into a single portable JSON document
   * (Right to Access / Portability). Reads are all scoped by userId. Writes an
   * audit entry so exports are traceable.
   */
  async exportData(userId: number) {
    const [user, addresses, orders, reviews, notifications] = await Promise.all(
      [
        this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            gender: true,
            dateOfBirth: true,
            provider: true,
            role: true,
            emailVerified: true,
            createdAt: true,
          },
        }),
        this.prisma.address.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.order.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: {
            orderNumber: true,
            status: true,
            currency: true,
            subtotal: true,
            shippingTotal: true,
            taxTotal: true,
            discountTotal: true,
            grandTotal: true,
            shippingAddress: true,
            billingAddress: true,
            createdAt: true,
            items: {
              select: {
                productTitle: true,
                sku: true,
                variantOptions: true,
                quantity: true,
                unitPrice: true,
                total: true,
              },
            },
          },
        }),
        this.prisma.review.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: {
            rating: true,
            title: true,
            body: true,
            status: true,
            createdAt: true,
            product: { select: { title: true, slug: true } },
          },
        }),
        this.prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: {
            type: true,
            title: true,
            body: true,
            readAt: true,
            createdAt: true,
          },
        }),
      ],
    );

    await this.audit.record({
      actorId: userId,
      action: 'account.data_export',
      entityType: 'User',
      entityId: String(userId),
      metadata: {
        counts: {
          addresses: addresses.length,
          orders: orders.length,
          reviews: reviews.length,
          notifications: notifications.length,
        },
      },
    });

    return {
      exportedAt: new Date().toISOString(),
      profile: user,
      addresses,
      orders,
      reviews,
      notifications,
    };
  }

  /**
   * Schedule account deletion (Right to Erasure) with a 30-day grace window.
   * Idempotent: calling again while already pending returns the existing
   * schedule rather than pushing the date out. Personal data is only anonymized
   * once the window elapses (see {@link anonymizeExpired}); orders are retained
   * in anonymized form for legal/financial reasons.
   */
  async requestDeletion(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, deletionScheduledAt: true },
    });

    if (user.status === 'PENDING_DELETION' && user.deletionScheduledAt) {
      return { deletionScheduledAt: user.deletionScheduledAt, alreadyScheduled: true };
    }

    const deletionScheduledAt = new Date(Date.now() + DELETION_GRACE_DAYS * DAY_MS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'PENDING_DELETION', deletionScheduledAt },
    });

    await this.audit.record({
      actorId: userId,
      action: 'account.deletion_requested',
      entityType: 'User',
      entityId: String(userId),
      metadata: { deletionScheduledAt: deletionScheduledAt.toISOString() },
    });

    return { deletionScheduledAt, alreadyScheduled: false };
  }

  /** Cancel a pending deletion while still inside the grace window. */
  async cancelDeletion(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true },
    });
    if (user.status !== 'PENDING_DELETION') {
      throw new BadRequestException('No account deletion is currently scheduled.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', deletionScheduledAt: null },
    });

    await this.audit.record({
      actorId: userId,
      action: 'account.deletion_cancelled',
      entityType: 'User',
      entityId: String(userId),
    });

    return { cancelled: true };
  }

  /**
   * Anonymize every account whose grace window has elapsed. Driven by the daily
   * cron. Scrubs PII in place and deletes cascade-safe personal records, but
   * retains orders (financial/tax history) linked to the now-anonymized user.
   * Best-effort per user so one failure never blocks the rest of the batch.
   */
  async anonymizeExpired(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.user.findMany({
      where: {
        status: 'PENDING_DELETION',
        deletionScheduledAt: { lte: now },
      },
      select: { id: true },
    });

    let anonymized = 0;
    for (const { id } of due) {
      try {
        await this.anonymizeUser(id);
        anonymized += 1;
      } catch (err) {
        this.logger.error(
          `Failed to anonymize user ${id}: ${(err as Error).message}`,
        );
      }
    }
    if (anonymized > 0) {
      this.logger.log(`Anonymized ${anonymized} expired account(s).`);
    }
    return anonymized;
  }

  private async anonymizeUser(userId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Purge cascade-safe personal records. Reviews are intentionally kept so
      // product rating aggregates stay intact; they render as "Deleted User"
      // once the profile below is scrubbed.
      await Promise.all([
        tx.address.deleteMany({ where: { userId } }),
        tx.wishlistItem.deleteMany({ where: { userId } }),
        tx.cart.deleteMany({ where: { userId } }),
        tx.notification.deleteMany({ where: { userId } }),
        tx.reviewVote.deleteMany({ where: { userId } }),
        tx.recentlyViewed.deleteMany({ where: { userId } }),
        tx.emailVerificationToken.deleteMany({ where: { userId } }),
        tx.passwordResetToken.deleteMany({ where: { userId } }),
      ]);

      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted+${userId}@deleted.invalid`,
          firstName: 'Deleted',
          lastName: 'User',
          phoneNumber: null,
          profilePhoto: null,
          gender: null,
          dateOfBirth: null,
          password: null,
          googleId: null,
          refreshToken: null,
          status: 'DELETED',
          deletionScheduledAt: null,
        },
      });

      await this.audit.record(
        {
          actorId: null,
          action: 'account.anonymized',
          entityType: 'User',
          entityId: String(userId),
        },
        tx as Prisma.TransactionClient,
      );
    });
  }
}
