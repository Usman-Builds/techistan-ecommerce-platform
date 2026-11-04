import { INestApplication } from '@nestjs/common';
import { CouponType, Prisma } from '@prisma/client';
import { createTestApp } from './utils/e2e';
import { resetDb, makeUser, TEST_ADDRESS } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';
import { CouponService } from '../src/modules/coupon/coupon.service';

/**
 * #13: coupon usage limits are enforced when the redemption is recorded (at
 * payment success), not only when the order is created. Orders opened before
 * the first one is paid must not push `usedCount` past `usageLimit`, even when
 * their payments confirm at the same moment. Real DB, so the row lock is real.
 */
describe('Coupon limits at redemption (e2e)', () => {
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
  async function pendingOrders(n: number, userId: number | null) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const o = await prisma.order.create({
        data: {
          orderNumber: `ORD-CPN-${userId ?? 'g'}-${i}`,
          userId,
          email: 'buyer@example.com',
          subtotal: 10000,
          discountTotal: 1000,
          grandTotal: 9000,
          couponCode: 'ONCE',
          shippingAddress: address,
          billingAddress: address,
        },
      });
      ids.push(o.id);
    }
    return ids;
  }
  const redeem = (orderId: string, userId: number | null) =>
    prisma.$transaction((tx) =>
      coupons.recordRedemption(tx, 'ONCE', orderId, userId),
    );

  it('never redeems a single-use coupon twice, even concurrently', async () => {
    await prisma.coupon.create({
      data: {
        code: 'ONCE',
        type: CouponType.PERCENT,
        value: 10,
        usageLimit: 1,
      },
    });
    const orders = await pendingOrders(3, null);

    await Promise.all(orders.map((id) => redeem(id, null)));

    const coupon = await prisma.coupon.findUniqueOrThrow({
      where: { code: 'ONCE' },
    });
    expect(coupon.usedCount).toBe(1);
    expect(await prisma.couponRedemption.count()).toBe(1);
  });

  it('enforces the per-customer limit at redemption', async () => {
    const user = await makeUser(prisma, {
      email: 'buyer@example.com',
      password: 'Str0ng!pass',
    });
    await prisma.coupon.create({
      data: {
        code: 'ONCE',
        type: CouponType.PERCENT,
        value: 10,
        perCustomerLimit: 1,
      },
    });
    const orders = await pendingOrders(2, user.id);

    await Promise.all(orders.map((id) => redeem(id, user.id)));

    expect(
      await prisma.couponRedemption.count({ where: { userId: user.id } }),
    ).toBe(1);
  });

  it('still records every redemption of an unlimited coupon', async () => {
    await prisma.coupon.create({
      data: { code: 'ONCE', type: CouponType.PERCENT, value: 10 },
    });
    const orders = await pendingOrders(3, null);
    await Promise.all(orders.map((id) => redeem(id, null)));
    const coupon = await prisma.coupon.findUniqueOrThrow({
      where: { code: 'ONCE' },
    });
    expect(coupon.usedCount).toBe(3);
  });

  it('stays idempotent for the same order', async () => {
    await prisma.coupon.create({
      data: {
        code: 'ONCE',
        type: CouponType.PERCENT,
        value: 10,
        usageLimit: 5,
      },
    });
    const [id] = await pendingOrders(1, null);
    await redeem(id, null);
    await redeem(id, null);
    expect(await prisma.couponRedemption.count()).toBe(1);
  });
});
