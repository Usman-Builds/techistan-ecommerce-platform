import { BadRequestException } from '@nestjs/common';
import { CouponType, PromotionScope } from '@prisma/client';
import { CouponService } from './coupon.service';

/**
 * Coupon validation gates (script 12, FR-601/602): active flag, scheduled
 * window, min-spend, global usage cap, and per-customer cap. `validate` reads
 * Prisma, so we stub the two collections it touches (`coupon`, `couponRedemption`).
 */
type CouponRow = {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  maxDiscount: number | null;
  active: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  minOrder: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  scope: PromotionScope;
  appliesToSaleItems: boolean;
  products: { productId: string }[];
  categories: { categoryId: string }[];
};

function base(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    id: 'c1',
    code: 'SAVE10',
    type: CouponType.PERCENT,
    value: 10,
    maxDiscount: null,
    active: true,
    startsAt: null,
    expiresAt: null,
    minOrder: null,
    usageLimit: null,
    perCustomerLimit: null,
    scope: PromotionScope.ALL,
    appliesToSaleItems: true,
    products: [],
    categories: [],
    ...overrides,
  };
}

/** Build the service with a coupon row and a redemption-count resolver. */
function build(
  coupon: CouponRow | null,
  count: (args: unknown) => number = () => 0,
) {
  const prisma = {
    coupon: { findFirst: jest.fn().mockResolvedValue(coupon) },
    couponRedemption: {
      count: jest
        .fn()
        .mockImplementation((args: unknown) => Promise.resolve(count(args))),
    },
  };
  // Third dep is CategoryService — only reached for CATEGORY-scoped coupons,
  // so the unscoped cases here never call it.
  const categories = { descendantIds: jest.fn().mockResolvedValue([]) };
  return new CouponService(prisma as never, {} as never, categories as never);
}

describe('CouponService.validate', () => {
  it('accepts a valid active coupon and returns the computed discount', async () => {
    const svc = build(base());
    const r = await svc.validate('save10', { subtotalCents: 10000 });
    expect(r).toMatchObject({
      code: 'SAVE10',
      discountCents: 1000,
      freeShipping: false,
    });
  });

  it('rejects an empty code', async () => {
    const svc = build(base());
    await expect(svc.validate('   ', { subtotalCents: 10000 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an unknown or inactive coupon', async () => {
    await expect(
      build(null).validate('NOPE', { subtotalCents: 10000 }),
    ).rejects.toThrow('not valid');
    await expect(
      build(base({ active: false })).validate('SAVE10', {
        subtotalCents: 10000,
      }),
    ).rejects.toThrow('not valid');
  });

  it('rejects a coupon that has not started yet', async () => {
    const future = new Date(Date.now() + 86_400_000);
    await expect(
      build(base({ startsAt: future })).validate('SAVE10', {
        subtotalCents: 10000,
      }),
    ).rejects.toThrow('not active yet');
  });

  it('rejects an expired coupon', async () => {
    const past = new Date(Date.now() - 86_400_000);
    await expect(
      build(base({ expiresAt: past })).validate('SAVE10', {
        subtotalCents: 10000,
      }),
    ).rejects.toThrow('expired');
  });

  it('enforces the minimum-spend gate', async () => {
    const svc = build(base({ minOrder: 5000 }));
    await expect(
      svc.validate('SAVE10', { subtotalCents: 4999 }),
    ).rejects.toThrow(/Spend at least/);
    // At the threshold it passes.
    await expect(
      svc.validate('SAVE10', { subtotalCents: 5000 }),
    ).resolves.toMatchObject({ code: 'SAVE10' });
  });

  it('enforces the global usage limit', async () => {
    const svc = build(base({ usageLimit: 100 }), () => 100); // already at cap
    await expect(
      svc.validate('SAVE10', { subtotalCents: 10000 }),
    ).rejects.toThrow('usage limit');
  });

  it('enforces the per-customer limit only for a signed-in user', async () => {
    // Per-user count returns the cap; guest (no userId) skips the check.
    const perUser = build(base({ perCustomerLimit: 1 }), (args) => {
      const where = (args as { where?: { userId?: number } })?.where;
      return where?.userId != null ? 1 : 0;
    });
    await expect(
      perUser.validate('SAVE10', { subtotalCents: 10000, userId: 7 }),
    ).rejects.toThrow('maximum number of times');
    // A guest cart cannot be attributed, so the per-customer cap does not apply.
    await expect(
      perUser.validate('SAVE10', { subtotalCents: 10000 }),
    ).resolves.toMatchObject({ code: 'SAVE10' });
  });

  it('flags FREE_SHIPPING with a zero monetary discount', async () => {
    const svc = build(base({ type: CouponType.FREE_SHIPPING, value: 0 }));
    const r = await svc.validate('SHIPFREE', { subtotalCents: 10000 });
    expect(r).toMatchObject({ discountCents: 0, freeShipping: true });
  });
});

/**
 * Scope gating (script 18). A restricted coupon discounts the ELIGIBLE slice of
 * a cart, not the cart subtotal — these lock in the two ways that can go wrong:
 * discounting money the coupon shouldn't touch, and refusing a coupon that does
 * apply.
 */
describe('CouponService.validate — promotion scope', () => {
  const line = (
    productId: string,
    categoryId: string | null,
    lineTotalCents: number,
    onSale = false,
  ) => ({ productId, categoryId, quantity: 1, lineTotalCents, onSale });

  it('discounts only the in-scope products for a PRODUCT-scoped coupon', async () => {
    const svc = build(
      base({
        scope: PromotionScope.PRODUCT,
        products: [{ productId: 'p1' }],
      }),
    );
    const r = await svc.validate('SAVE10', {
      subtotalCents: 10000,
      lines: [line('p1', 'c1', 4000), line('p2', 'c1', 6000)],
    });
    // 10% of the 4000 eligible cents, not of the 10000 cart subtotal.
    expect(r).toMatchObject({
      discountCents: 400,
      eligibleSubtotalCents: 4000,
    });
  });

  it('rejects a PRODUCT-scoped coupon when nothing in the cart matches', async () => {
    const svc = build(
      base({
        scope: PromotionScope.PRODUCT,
        products: [{ productId: 'p9' }],
      }),
    );
    await expect(
      svc.validate('SAVE10', {
        subtotalCents: 10000,
        lines: [line('p1', 'c1', 10000)],
      }),
    ).rejects.toThrow('certain products');
  });

  it('expands a CATEGORY scope over the subtree', async () => {
    const prisma = {
      coupon: {
        findFirst: jest.fn().mockResolvedValue(
          base({
            scope: PromotionScope.CATEGORY,
            categories: [{ categoryId: 'root' }],
          }),
        ),
      },
      couponRedemption: { count: jest.fn().mockResolvedValue(0) },
    };
    // "root" resolves to itself plus its child "kid".
    const categories = {
      descendantIds: jest.fn().mockResolvedValue(['root', 'kid']),
    };
    const svc = new CouponService(
      prisma as never,
      {} as never,
      categories as never,
    );

    const r = await svc.validate('SAVE10', {
      subtotalCents: 10000,
      lines: [line('p1', 'kid', 3000), line('p2', 'other', 7000)],
    });
    expect(categories.descendantIds).toHaveBeenCalledWith(['root']);
    expect(r).toMatchObject({
      discountCents: 300,
      eligibleSubtotalCents: 3000,
    });
  });

  it('drops sale lines when the coupon excludes them', async () => {
    const svc = build(base({ appliesToSaleItems: false }));
    const r = await svc.validate('SAVE10', {
      subtotalCents: 10000,
      lines: [line('p1', 'c1', 4000, true), line('p2', 'c1', 6000)],
    });
    expect(r).toMatchObject({
      discountCents: 600,
      eligibleSubtotalCents: 6000,
    });
  });

  it('refuses a scoped coupon when the caller supplied no lines', async () => {
    // Failing closed matters here: falling back to the cart subtotal would
    // discount everything precisely when we cannot tell what is eligible.
    const svc = build(
      base({
        scope: PromotionScope.PRODUCT,
        products: [{ productId: 'p1' }],
      }),
    );
    await expect(
      svc.validate('SAVE10', { subtotalCents: 10000 }),
    ).rejects.toThrow('certain products');
  });
});
