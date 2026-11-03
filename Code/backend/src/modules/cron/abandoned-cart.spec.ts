import { AbandonedCartService } from './abandoned-cart.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EmailService } from '../email/email.service';

/**
 * #38: each recovery stage must fire at most once per cart, even when two runs
 * overlap (the hourly @Cron plus POST /cron/abandoned-carts, or two
 * instances). A run must claim the stage before sending.
 */
type FakeCart = {
  id: number;
  userId: number | null;
  guestEmail: string | null;
  recoveryStage: number;
  updatedAt: Date;
  user: { email: string; firstName: string | null } | null;
  _count: { items: number };
};

const NOW = new Date('2026-11-03T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

function setup(carts: FakeCart[], afterFind: () => void = () => {}) {
  const matches = (c: FakeCart, where: any): boolean => {
    const rs = where.recoveryStage;
    if (typeof rs === 'number' && c.recoveryStage !== rs) return false;
    if (rs?.lt !== undefined && !(c.recoveryStage < rs.lt)) return false;
    const u = where.updatedAt;
    if (u instanceof Date && c.updatedAt.getTime() !== u.getTime())
      return false;
    if (u?.lte && !(c.updatedAt <= u.lte)) return false;
    if (u?.gt && !(c.updatedAt > u.gt)) return false;
    if (where.id !== undefined && c.id !== where.id) return false;
    return true;
  };
  // Every await yields, so two runs interleave like concurrent requests.
  const tick = () => new Promise((r) => setImmediate(r));
  const prisma = {
    cart: {
      findMany: jest.fn(async ({ where }: any) => {
        await tick();
        const rows = carts
          .filter((c) => matches(c, where))
          .map((c) => ({ ...c }));
        afterFind();
        return rows;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        await tick();
        const hit = carts.filter((c) => matches(c, where));
        for (const c of hit) Object.assign(c, data);
        return { count: hit.length };
      }),
    },
  };
  const email = {
    sendAbandonedCart: jest.fn(async () => {
      await tick();
    }),
  };
  const service = new AbandonedCartService(
    prisma as unknown as PrismaService,
    email as unknown as EmailService,
  );
  return { service, email, carts };
}

const cart = (over: Partial<FakeCart>): FakeCart => ({
  id: 1,
  userId: 7,
  guestEmail: null,
  recoveryStage: 0,
  updatedAt: hoursAgo(2),
  user: { email: 'shopper@example.com', firstName: 'Sam' },
  _count: { items: 2 },
  ...over,
});

describe('AbandonedCartService.run', () => {
  it('sends the first nudge once and records stage 1', async () => {
    const { service, email, carts } = setup([cart({})]);
    await expect(service.run(NOW)).resolves.toEqual({
      firstSent: 1,
      finalSent: 0,
    });
    expect(email.sendAbandonedCart).toHaveBeenCalledTimes(1);
    expect(carts[0].recoveryStage).toBe(1);
    // The abandonment clock is preserved.
    expect(carts[0].updatedAt).toEqual(hoursAgo(2));
  });

  it('sends one email when two runs overlap on the first stage', async () => {
    const { service, email } = setup([cart({})]);
    const [a, b] = await Promise.all([service.run(NOW), service.run(NOW)]);
    expect(email.sendAbandonedCart).toHaveBeenCalledTimes(1);
    expect(a.firstSent + b.firstSent).toBe(1);
  });

  it('sends one email when two runs overlap on the final stage', async () => {
    const { service, email } = setup([
      cart({ recoveryStage: 1, updatedAt: hoursAgo(30) }),
    ]);
    const [a, b] = await Promise.all([service.run(NOW), service.run(NOW)]);
    expect(email.sendAbandonedCart).toHaveBeenCalledTimes(1);
    expect(a.finalSent + b.finalSent).toBe(1);
  });

  it('does not send for a cart the shopper changed after it was selected', async () => {
    const carts = [cart({})];
    // Right after the selection the shopper edits the cart (clock bumped).
    const { service, email } = setup(carts, () => {
      carts[0].updatedAt = NOW;
    });
    await service.run(NOW);
    expect(email.sendAbandonedCart).not.toHaveBeenCalled();
    expect(carts[0].recoveryStage).toBe(0);
  });

  it('does not repeat a stage on a later run', async () => {
    const { service, email } = setup([cart({})]);
    await service.run(NOW);
    await service.run(NOW);
    expect(email.sendAbandonedCart).toHaveBeenCalledTimes(1);
  });
});
