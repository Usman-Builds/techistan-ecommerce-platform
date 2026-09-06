import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ABANDONED_FINAL_MS, ABANDONED_FIRST_MS } from '../cart/cart.constants';

export interface RecoveryRunResult {
  firstSent: number;
  finalSent: number;
}

const CART_INCLUDE = {
  user: { select: { email: true, firstName: true } },
  _count: { select: { items: true } },
} satisfies Prisma.CartInclude;

type CartRow = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;

/**
 * Abandoned-cart recovery (script 16, FR-306). Runs IN THE BACKEND — hourly via
 * @nestjs/schedule and on-demand via the guarded POST /cron/abandoned-carts route
 * (never a Next API route). Two stages fire at most once each per cart, tracked by
 * Cart.recoveryStage (reset to 0 whenever the shopper changes the cart):
 *   • stage 1 — idle ≥ 1h (and < 24h): the first nudge
 *   • stage 2 — idle ≥ 24h: the final nudge
 * A cart is recoverable when it still has items and has a reachable email (the
 * logged-in user's, or a captured guest email). Emails go through EmailService
 * (branded template, deep link back to the cart) and never throw.
 */
@Injectable()
export class AbandonedCartService {
  private readonly logger = new Logger(AbandonedCartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'abandoned-cart-recovery' })
  async handleCron(): Promise<void> {
    const result = await this.run();
    this.logger.log(
      `Abandoned-cart recovery: ${result.firstSent} first-stage, ${result.finalSent} final-stage emails sent.`,
    );
  }

  /** Execute one recovery pass. Returns per-stage send counts. */
  async run(now: Date = new Date()): Promise<RecoveryRunResult> {
    const firstCutoff = new Date(now.getTime() - ABANDONED_FIRST_MS);
    const finalCutoff = new Date(now.getTime() - ABANDONED_FINAL_MS);
    const reachable: Prisma.CartWhereInput = {
      items: { some: {} },
      OR: [{ userId: { not: null } }, { guestEmail: { not: null } }],
    };

    // Stage 1: idle between 1h and 24h, never nudged.
    const firstDue = await this.prisma.cart.findMany({
      where: {
        ...reachable,
        recoveryStage: 0,
        updatedAt: { lte: firstCutoff, gt: finalCutoff },
      },
      include: CART_INCLUDE,
      take: 500,
    });

    // Stage 2: idle ≥ 24h, not yet on the final stage.
    const finalDue = await this.prisma.cart.findMany({
      where: {
        ...reachable,
        recoveryStage: { lt: 2 },
        updatedAt: { lte: finalCutoff },
      },
      include: CART_INCLUDE,
      take: 500,
    });

    let firstSent = 0;
    let finalSent = 0;
    for (const cart of firstDue) {
      if (await this.sendFor(cart, 1)) firstSent++;
    }
    for (const cart of finalDue) {
      if (await this.sendFor(cart, 2)) finalSent++;
    }
    return { firstSent, finalSent };
  }

  /** Send the recovery email for one cart and advance its stage marker. */
  private async sendFor(cart: CartRow, stage: 1 | 2): Promise<boolean> {
    const email = cart.user?.email ?? cart.guestEmail;
    if (!email) return false;
    await this.email.sendAbandonedCart(email, {
      firstName: cart.user?.firstName ?? null,
      itemCount: cart._count.items,
    });
    // Advance the stage WITHOUT bumping updatedAt (preserve the abandonment clock
    // so the 24h stage is measured from real inactivity, not from this send).
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { recoveryStage: stage, updatedAt: cart.updatedAt },
    });
    return true;
  }
}
