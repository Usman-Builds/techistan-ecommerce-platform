import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderService } from './order.service';

/**
 * Order-number generator (script 10, #52). Format is ORD-YYYYMMDD-XXXXXX where
 * XXXXXX is a random 6-character Crockford base-32 suffix (about a billion
 * numbers per UTC day); DB-level uniqueness is enforced by a unique index and
 * the service retries on collision. The method is private+static, reached by
 * name.
 */
const generate = (): string =>
  (
    OrderService as unknown as { generateOrderNumber(): string }
  ).generateOrderNumber();

describe('OrderService.generateOrderNumber', () => {
  it('matches the ORD-YYYYMMDD-XXXXXX format', () => {
    expect(generate()).toMatch(/^ORD-\d{8}-[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  it('embeds today’s UTC date', () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    expect(generate()).toContain(`ORD-${y}${m}${d}-`);
  });

  it('is not capped at 10,000 numbers per day (#52)', () => {
    // The old 4-digit suffix had exactly 10,000 values, so 20,000 draws could
    // never produce more than 10,000 distinct numbers.
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) seen.add(generate());
    expect(seen.size).toBeGreaterThan(19_990);
  });
});

describe('OrderService.persistOrder number exhaustion (#52)', () => {
  it('returns 503 (retryable), not a bare 500, when every attempt collides', async () => {
    const collision = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['orderNumber'] },
      },
    );
    const prisma = { $transaction: jest.fn().mockRejectedValue(collision) };
    const service = new OrderService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const persist = (
      service as unknown as {
        persistOrder(p: Record<string, unknown>): Promise<unknown>;
      }
    ).persistOrder.bind(service);

    await expect(persist({ dto: {}, lines: [] })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });
});
