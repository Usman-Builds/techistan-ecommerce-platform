import { OrderService } from './order.service';

/**
 * Order-number generator (script 10). Format is ORD-YYYYMMDD-NNNN where NNNN is
 * a zero-padded random suffix; DB-level uniqueness is enforced by a unique index
 * (the service retries on collision). Here we pin the format and the very low
 * collision rate of the suffix. The method is private+static, reached by name.
 */
const generate = (
  OrderService as unknown as { generateOrderNumber(): string }
).generateOrderNumber;

describe('OrderService.generateOrderNumber', () => {
  it('matches the ORD-YYYYMMDD-NNNN format', () => {
    expect(generate()).toMatch(/^ORD-\d{8}-\d{4}$/);
  });

  it('embeds today’s UTC date', () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    expect(generate()).toContain(`ORD-${y}${m}${d}-`);
  });

  it('produces mostly-unique suffixes across many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generate());
    // 500 draws from 10k suffixes: collisions are rare — the DB unique index and
    // 5-attempt retry cover the residual. Assert overwhelming uniqueness here.
    expect(seen.size).toBeGreaterThan(470);
  });
});
