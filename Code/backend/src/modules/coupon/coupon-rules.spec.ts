import { BadRequestException } from '@nestjs/common';
import { CouponType, DiscountStatus, PromotionScope } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CouponService } from './coupon.service';
import { AutomaticDiscountRuleDto } from './dto/automatic-discount.dto';

/**
 * Promotion invariants (#14): a PERCENT coupon is a whole percent 0-100, and a
 * promotion's start can't be after its end. Without these, a typo (500 for 50)
 * makes every eligible item free, and an inverted window creates a coupon that
 * can never apply. Both create and update paths must enforce them.
 */
function setup(
  existingCoupon: Record<string, unknown> = {},
  existingDiscount: Record<string, unknown> = {},
) {
  const prisma = {
    coupon: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'c1',
        code: 'HALF',
        type: CouponType.PERCENT,
        value: 50,
        startsAt: null,
        expiresAt: null,
        products: [],
        categories: [],
        ...existingCoupon,
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'c1', code: 'X' }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ id: 'c1', code: 'X' }),
    },
    automaticDiscount: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'a1',
        startsAt: null,
        endsAt: null,
        products: [],
        categories: [],
        ...existingDiscount,
      }),
      create: jest.fn().mockResolvedValue({ id: 'a1' }),
      update: jest.fn().mockResolvedValue({ id: 'a1' }),
    },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new CouponService(
    prisma as never,
    audit as never,
    {} as never,
  );
  return { service, prisma };
}

const baseCoupon = {
  code: 'HALF',
  type: CouponType.PERCENT,
  value: 50,
  scope: PromotionScope.ALL,
};

describe('coupon rules (#14)', () => {
  describe('createCoupon', () => {
    it('rejects a PERCENT value above 100', async () => {
      const { service, prisma } = setup();
      await expect(
        service.createCoupon({ ...baseCoupon, value: 500 } as never, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.coupon.create).not.toHaveBeenCalled();
    });

    it('accepts PERCENT 100 and a large FIXED amount', async () => {
      const { service, prisma } = setup();
      await service.createCoupon({ ...baseCoupon, value: 100 } as never, 1);
      await service.createCoupon(
        {
          ...baseCoupon,
          code: 'TENNER',
          type: CouponType.FIXED,
          value: 5000,
        } as never,
        1,
      );
      expect(prisma.coupon.create).toHaveBeenCalledTimes(2);
    });

    it('rejects startsAt after expiresAt', async () => {
      const { service, prisma } = setup();
      await expect(
        service.createCoupon(
          {
            ...baseCoupon,
            startsAt: '2026-12-31T00:00:00Z',
            expiresAt: '2026-12-01T00:00:00Z',
          } as never,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.coupon.create).not.toHaveBeenCalled();
    });
  });

  describe('generateCoupons', () => {
    it('rejects a PERCENT value above 100', async () => {
      const { service, prisma } = setup();
      await expect(
        service.generateCoupons(
          { count: 2, type: CouponType.PERCENT, value: 150 } as never,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.coupon.createMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateCoupon', () => {
    it('rejects raising the value of an existing PERCENT coupon past 100', async () => {
      const { service, prisma } = setup();
      await expect(
        service.updateCoupon('c1', { value: 500 } as never, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.coupon.update).not.toHaveBeenCalled();
    });

    it('rejects switching a large FIXED coupon to PERCENT', async () => {
      const { service, prisma } = setup({
        type: CouponType.FIXED,
        value: 2500,
      });
      await expect(
        service.updateCoupon('c1', { type: CouponType.PERCENT } as never, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.coupon.update).not.toHaveBeenCalled();
    });

    it('rejects an expiry before the stored start', async () => {
      const { service, prisma } = setup({
        startsAt: new Date('2026-12-31T00:00:00Z'),
      });
      await expect(
        service.updateCoupon(
          'c1',
          { expiresAt: '2026-12-01T00:00:00Z' } as never,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.coupon.update).not.toHaveBeenCalled();
    });

    it('allows a valid edit', async () => {
      const { service, prisma } = setup();
      await service.updateCoupon('c1', { value: 25 } as never, 1);
      expect(prisma.coupon.update).toHaveBeenCalled();
    });
  });

  describe('automatic discounts', () => {
    it('rule DTO rejects percentOff above 100', async () => {
      const errors = await validate(
        plainToInstance(AutomaticDiscountRuleDto, { percentOff: 500 }),
      );
      expect(errors.map((e) => e.property)).toContain('percentOff');
    });

    it('rule DTO accepts percentOff 100', async () => {
      const errors = await validate(
        plainToInstance(AutomaticDiscountRuleDto, { percentOff: 100 }),
      );
      expect(errors).toHaveLength(0);
    });

    it('create rejects startsAt after endsAt', async () => {
      const { service, prisma } = setup();
      await expect(
        service.createAutomaticDiscount(
          {
            name: 'Spring',
            rule: { percentOff: 10 },
            status: DiscountStatus.ACTIVE,
            startsAt: '2026-05-01T00:00:00Z',
            endsAt: '2026-04-01T00:00:00Z',
          } as never,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.automaticDiscount.create).not.toHaveBeenCalled();
    });

    it('update rejects a start after the stored end', async () => {
      const { service, prisma } = setup(
        {},
        { endsAt: new Date('2026-04-01T00:00:00Z') },
      );
      await expect(
        service.updateAutomaticDiscount(
          'a1',
          { startsAt: '2026-05-01T00:00:00Z' } as never,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.automaticDiscount.update).not.toHaveBeenCalled();
    });
  });
});
