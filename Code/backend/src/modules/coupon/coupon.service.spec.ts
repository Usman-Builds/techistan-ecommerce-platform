import { CouponType, DiscountStatus, PromotionScope } from '@prisma/client';
import { CouponService } from './coupon.service';
import {
  compareAtWhenOnSale,
  effectivePriceCents,
  isSaleActive,
} from './sale-pricing';

/**
 * The discount math (`computeDiscount`) and automatic-discount evaluation are the
 * heart of the promotions engine (FR-601..603). `computeDiscount` is pure, so we
 * build the service with dummy deps; `evaluateAutomaticDiscounts` reads Prisma, so
 * we stub a minimal `automaticDiscount.findMany`. Sale-pricing helpers are pure.
 */
describe('CouponService.computeDiscount', () => {
  const service = new CouponService({} as never, {} as never, {} as never);
  const coupon = (
    type: CouponType,
    value: number,
    maxDiscount: number | null = null,
  ) => ({ type, value, maxDiscount });

  it('applies a whole-percent discount', () => {
    expect(service.computeDiscount(coupon(CouponType.PERCENT, 20), 10000)).toBe(
      2000,
    );
  });

  it('caps a PERCENT discount at maxDiscount', () => {
    expect(
      service.computeDiscount(coupon(CouponType.PERCENT, 50, 1500), 10000),
    ).toBe(1500);
  });

  it('never lets a FIXED discount exceed the subtotal', () => {
    expect(service.computeDiscount(coupon(CouponType.FIXED, 5000), 3000)).toBe(
      3000,
    );
  });

  it('returns 0 for FREE_SHIPPING (waiver applied by the estimator)', () => {
    expect(
      service.computeDiscount(coupon(CouponType.FREE_SHIPPING, 0), 10000),
    ).toBe(0);
  });
});

describe('CouponService.evaluateAutomaticDiscounts', () => {
  const build = (rows: unknown[]) =>
    new CouponService(
      { automaticDiscount: { findMany: () => Promise.resolve(rows) } } as never,
      {} as never,
      { descendantIds: () => Promise.resolve([]) } as never,
    );

  /**
   * A discount row as the service reads it. The scope columns are non-nullable
   * in the schema, so a fixture omitting them would be testing a state the
   * database cannot produce — this helper supplies the unrestricted defaults.
   */
  const row = (over: Record<string, unknown>) => ({
    status: DiscountStatus.ACTIVE,
    scope: PromotionScope.ALL,
    appliesToSaleItems: true,
    products: [],
    categories: [],
    ...over,
  });

  it('applies the highest-priority rule whose gates are met', async () => {
    const service = build([
      row({
        id: 'a',
        name: 'Buy 3 get 10%',
        priority: 10,
        rule: { minQty: 3, percentOff: 10 },
      }),
    ]);
    const [applied] = await service.evaluateAutomaticDiscounts({
      subtotalCents: 10000,
      itemCount: 3,
    });
    expect(applied.discountCents).toBe(1000);
    expect(applied.freeShipping).toBe(false);
  });

  it('skips a rule whose minQty gate is unmet', async () => {
    const service = build([
      row({
        id: 'a',
        name: 'Buy 3',
        priority: 10,
        rule: { minQty: 3, percentOff: 10 },
      }),
    ]);
    const result = await service.evaluateAutomaticDiscounts({
      subtotalCents: 10000,
      itemCount: 2,
    });
    expect(result).toHaveLength(0);
  });

  it('applies a free-shipping rule with no monetary discount', async () => {
    const service = build([
      row({
        id: 'a',
        name: 'Free ship over $50',
        priority: 1,
        rule: { minSubtotal: 5000, freeShipping: true },
      }),
    ]);
    const [applied] = await service.evaluateAutomaticDiscounts({
      subtotalCents: 6000,
      itemCount: 1,
    });
    expect(applied.discountCents).toBe(0);
    expect(applied.freeShipping).toBe(true);
  });

  it('discounts only the in-scope lines for a CATEGORY-scoped rule', async () => {
    const service = new CouponService(
      {
        automaticDiscount: {
          findMany: () =>
            Promise.resolve([
              row({
                id: 'a',
                name: '10% off audio',
                priority: 5,
                rule: { percentOff: 10 },
                scope: PromotionScope.CATEGORY,
                categories: [{ categoryId: 'audio' }],
              }),
            ]),
        },
      } as never,
      {} as never,
      { descendantIds: () => Promise.resolve(['audio']) } as never,
    );

    const [applied] = await service.evaluateAutomaticDiscounts({
      subtotalCents: 10000,
      itemCount: 2,
      lines: [
        {
          productId: 'p1',
          categoryId: 'audio',
          quantity: 1,
          lineTotalCents: 4000,
          onSale: false,
        },
        {
          productId: 'p2',
          categoryId: 'laptops',
          quantity: 1,
          lineTotalCents: 6000,
          onSale: false,
        },
      ],
    });
    // 10% of the eligible 4000, not of the 10000 cart subtotal.
    expect(applied.discountCents).toBe(400);
  });

  it('skips a scoped rule that matches nothing in the cart', async () => {
    const service = new CouponService(
      {
        automaticDiscount: {
          findMany: () =>
            Promise.resolve([
              row({
                id: 'a',
                name: '10% off audio',
                priority: 5,
                rule: { percentOff: 10 },
                scope: PromotionScope.CATEGORY,
                categories: [{ categoryId: 'audio' }],
              }),
            ]),
        },
      } as never,
      {} as never,
      { descendantIds: () => Promise.resolve(['audio']) } as never,
    );

    const result = await service.evaluateAutomaticDiscounts({
      subtotalCents: 6000,
      itemCount: 1,
      lines: [
        {
          productId: 'p2',
          categoryId: 'laptops',
          quantity: 1,
          lineTotalCents: 6000,
          onSale: false,
        },
      ],
    });
    expect(result).toHaveLength(0);
  });
});

describe('sale-pricing helpers', () => {
  const base = {
    price: 4000,
    salePrice: 3000,
    saleStartsAt: null as Date | null,
    saleEndsAt: null as Date | null,
  };
  const now = new Date('2026-07-22T12:00:00Z');

  it('treats an open-ended sale price as active', () => {
    expect(isSaleActive(base, now)).toBe(true);
    expect(effectivePriceCents(base, now)).toBe(3000);
    expect(compareAtWhenOnSale(base, now)).toBe(4000);
  });

  it('ignores a sale outside its scheduled window', () => {
    const future = {
      ...base,
      saleStartsAt: new Date('2026-08-01T00:00:00Z'),
    };
    expect(isSaleActive(future, now)).toBe(false);
    expect(effectivePriceCents(future, now)).toBe(4000);
    expect(compareAtWhenOnSale(future, now)).toBeNull();
  });

  it('ignores a sale price that is not below the regular price', () => {
    expect(isSaleActive({ ...base, salePrice: 4000 }, now)).toBe(false);
    expect(isSaleActive({ ...base, salePrice: null }, now)).toBe(false);
  });
});
