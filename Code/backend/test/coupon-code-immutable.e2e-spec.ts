import { BadRequestException, INestApplication } from '@nestjs/common';
import { CouponType, OrderStatus, Prisma } from '@prisma/client';
import { createTestApp } from './utils/e2e';
import { resetDb, TEST_ADDRESS } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';
import { CouponService } from '../src/modules/coupon/coupon.service';

/**
 * #44: orders reference a coupon by its code, and the redemption looks the
 * coupon up by that code at payment time. So a code that orders depend on can't
 * be renamed, and such a coupon can't be deleted; otherwise the redemption is
 * silently skipped and usage limits stop counting it. Real DB end-to-end.
 */
describe('Coupon code immutability (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let coupons: CouponService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    coupons = app.get(CouponService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });

  const address = TEST_ADDRESS as unknown as Prisma.InputJsonValue;
  const makeCoupon = () =>
    prisma.coupon.create({
      data: {
        code: 'SAVE10',
        type: CouponType.PERCENT,
        value: 10,
        usageLimit: 1,
      },
    });
  const makeOrder = (status: OrderStatus, couponCode = 'SAVE10') =>
    prisma.order.create({
      data: {
        orderNumber: `ORD-CPN-${status}-${Math.random().toString(36).slice(2, 8)}`,
        email: 'buyer@example.com',
        status,
        subtotal: 10000,
        discountTotal: 1000,
        grandTotal: 9000,
        couponCode,
        shippingAddress: address,
        billingAddress: address,
      },
    });

  describe('rename', () => {
    it('is refused while a pending order uses the code', async () => {
      const coupon = await makeCoupon();
      await makeOrder(OrderStatus.PENDING, 'save10');
      await expect(
        coupons.updateCoupon(coupon.id, { code: 'SAVE10B' } as never, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      const after = await prisma.coupon.findUniqueOrThrow({
        where: { id: coupon.id },
      });
      expect(after.code).toBe('SAVE10');
    });

    it('is refused once the coupon has been redeemed', async () => {
      const coupon = await makeCoupon();
      const order = await makeOrder(OrderStatus.CONFIRMED);
      await prisma.couponRedemption.create({
        data: { couponId: coupon.id, orderId: order.id, discountCents: 1000 },
      });
      await expect(
        coupons.updateCoupon(coupon.id, { code: 'SAVE10B' } as never, 1),
      ).rejects.toThrow(/already been used/);
    });

    it('is allowed for an unused coupon, and other edits still work', async () => {
      const coupon = await makeCoupon();
      await makeOrder(OrderStatus.CANCELLED); // a dead order doesn't pin the code
      await coupons.updateCoupon(coupon.id, { code: 'save10b' } as never, 1);
      const after = await prisma.coupon.findUniqueOrThrow({
        where: { id: coupon.id },
      });
      expect(after.code).toBe('SAVE10B');
    });

    it('accepts re-sending the same code on a used coupon', async () => {
      const coupon = await makeCoupon();
      await makeOrder(OrderStatus.PENDING);
      await expect(
        coupons.updateCoupon(
          coupon.id,
          { code: 'save10', value: 15 } as never,
          1,
        ),
      ).resolves.toMatchObject({ code: 'SAVE10', value: 15 });
    });
  });

  describe('delete', () => {
    it('is refused while a pending order uses the code', async () => {
      const coupon = await makeCoupon();
      await makeOrder(OrderStatus.PENDING);
      await expect(coupons.deleteCoupon(coupon.id, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(await prisma.coupon.count()).toBe(1);
    });

    it('is refused once redeemed (it would erase the redemption history)', async () => {
      const coupon = await makeCoupon();
      const order = await makeOrder(OrderStatus.CONFIRMED);
      await prisma.couponRedemption.create({
        data: { couponId: coupon.id, orderId: order.id, discountCents: 1000 },
      });
      await expect(coupons.deleteCoupon(coupon.id, 1)).rejects.toThrow(
        /deactivate/i,
      );
      expect(await prisma.couponRedemption.count()).toBe(1);
    });

    it('is allowed for an unused coupon', async () => {
      const coupon = await makeCoupon();
      await expect(coupons.deleteCoupon(coupon.id, 1)).resolves.toEqual({
        id: coupon.id,
        deleted: true,
      });
    });
  });
});
