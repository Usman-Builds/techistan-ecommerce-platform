import { InventoryService } from './inventory.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { CategoryService } from '../category/category.service';
import type { NotifierService } from '../notification/notifier.service';

/**
 * #18: the inventory "retail value" total must price each variant at what it
 * sells for today, i.e. the sale price only while the sale is active (same rule
 * as the storefront's `effectivePriceCents`).
 */
const DAY = 24 * 3600_000;
const now = Date.now();

type Row = {
  stock: number;
  price: number;
  salePrice: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
};

function service(rows: Row[]) {
  // Behave like Prisma: return only the fields the query selected.
  const pick = (select: Record<string, unknown>) =>
    rows.map((r) =>
      Object.fromEntries(
        Object.keys(select)
          .filter((k) => k in r)
          .map((k) => [k, r[k as keyof Row]]),
      ),
    );
  const prisma = {
    storeSetting: { findFirst: jest.fn(() => Promise.resolve(null)) },
    productVariant: {
      findMany: jest.fn(({ select }: { select: Record<string, unknown> }) =>
        Promise.resolve(pick(select)),
      ),
      count: jest.fn(() => Promise.resolve(rows.length)),
      aggregate: jest.fn(() =>
        Promise.resolve({ _sum: { stock: 0 }, _count: { _all: rows.length } }),
      ),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  // The page query selects the product relation; return no page rows so the
  // test only exercises the totals.
  prisma.productVariant.findMany.mockImplementationOnce(() =>
    Promise.resolve([]),
  );
  return new InventoryService(
    prisma as unknown as PrismaService,
    {} as AuditService,
    {} as CategoryService,
    {} as NotifierService,
  );
}

const variant = (over: Partial<Row>): Row => ({
  stock: 10,
  price: 10000,
  salePrice: null,
  saleStartsAt: null,
  saleEndsAt: null,
  ...over,
});

describe('InventoryService.list retail value', () => {
  it.each<[string, Partial<Row>, number]>([
    ['no sale', {}, 100000],
    ['an open-ended active sale', { salePrice: 5000 }, 50000],
    [
      'an active scheduled sale',
      {
        salePrice: 5000,
        saleStartsAt: new Date(now - DAY),
        saleEndsAt: new Date(now + DAY),
      },
      50000,
    ],
    [
      'a sale that ended last week',
      { salePrice: 5000, saleEndsAt: new Date(now - 7 * DAY) },
      100000,
    ],
    [
      'a sale that starts tomorrow',
      { salePrice: 5000, saleStartsAt: new Date(now + DAY) },
      100000,
    ],
    ['a "sale" price above the regular price', { salePrice: 12000 }, 100000],
  ])('prices %s correctly', async (_, over, expected) => {
    const res = await service([variant(over)]).list({});
    expect(res.totals.retailValueCents).toBe(expected);
  });

  it('sums mixed variants', async () => {
    const res = await service([
      variant({ stock: 2, price: 1000, salePrice: 500 }), // active: 1000
      variant({
        stock: 3,
        price: 1000,
        salePrice: 500,
        saleEndsAt: new Date(now - DAY),
      }), // expired: 3000
    ]).list({});
    expect(res.totals.retailValueCents).toBe(4000);
  });
});
