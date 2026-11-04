import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CouponType, OrderStatus, PaymentStatus, Role } from '@prisma/client';
import request from 'supertest';
import type Stripe from 'stripe';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrderService } from '../src/modules/order/order.service';
import { PaymentService } from '../src/modules/payment/payment.service';
import { STRIPE_CLIENT } from '../src/modules/payment/stripe.provider';
import {
  resetDb,
  makeUser,
  makeProduct,
  makeCartWithItem,
  TEST_ADDRESS,
} from './utils/db';

/**
 * #7: an admin cancelling a paid order (CONFIRMED / PROCESSING) must refund
 * the customer and put the units back in stock, not just flip the status.
 * Real DB; Stripe is stubbed and the payment arrives as a webhook event.
 */
const PASSWORD = 'Str0ng!pass';

describe('Admin cancel of a paid order (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrderService;
  let payments: PaymentService;
  let seq = 0;
  let refundFails = false;
  const refundsCreate = jest.fn((params: { amount: number }) =>
    refundFails
      ? Promise.reject(new Error('card_declined'))
      : Promise.resolve({ id: `re_${++seq}`, amount: params.amount }),
  );

  beforeAll(async () => {
    const stripe = {
      paymentIntents: {
        create: jest.fn(() => {
          seq += 1;
          return Promise.resolve({
            id: `pi_cancel_${seq}`,
            client_secret: `cs_${seq}`,
          });
        }),
      },
      refunds: { create: refundsCreate },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripe)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    orders = app.get(OrderService);
    payments = app.get(PaymentService);
  });

  afterAll(async () => {
    await app.close();
  });

  let adminToken: string;
  beforeEach(async () => {
    await resetDb(prisma);
    refundsCreate.mockClear();
    refundFails = false;
    await makeUser(prisma, {
      email: 'admin@example.com',
      password: PASSWORD,
      role: Role.ADMIN,
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    adminToken = (login.body as { accessToken: string }).accessToken;
  });

  /** A paid (CONFIRMED) order for `quantity` units of a fresh variant. */
  async function paidOrder(quantity: number, stock: number, coupon?: string) {
    const { product, variant } = await makeProduct(prisma, {
      priceCents: 2500,
      stock,
    });
    seq += 1;
    const key = `cancel-${seq}`;
    const cart = await makeCartWithItem(prisma, {
      sessionId: `s-${key}`,
      productId: product.id,
      variantId: variant.id,
      quantity,
      unitPriceCents: variant.price,
    });
    if (coupon) {
      await prisma.cart.update({
        where: { id: cart.id },
        data: { couponCode: coupon },
      });
    }
    const { order } = await orders.createOrder(
      {
        email: `${key}@example.com`,
        idempotencyKey: key,
        shippingAddress: TEST_ADDRESS,
      } as never,
      null,
      cart.id,
    );
    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    await payments.handleEvent({
      id: `evt_${key}`,
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: payment.stripePaymentIntentId,
          payment_method_types: ['card'],
        },
      },
    } as unknown as Stripe.Event);
    return {
      orderId: order.id,
      variantId: variant.id,
      total: order.grandTotal,
    };
  }

  const setStatus = (orderId: string, status: OrderStatus) =>
    request(app.getHttpServer())
      .patch(`/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status });

  const stockOf = async (variantId: string) =>
    (
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
      })
    ).stock;

  it('refunds and restocks a CONFIRMED order the admin cancels', async () => {
    const { orderId, variantId, total } = await paidOrder(2, 5);
    expect(await stockOf(variantId)).toBe(3);

    await setStatus(orderId, OrderStatus.CANCELLED).expect(200);

    expect(await stockOf(variantId)).toBe(5);
    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect(refundsCreate.mock.calls[0][0]).toMatchObject({ amount: total });
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: true },
    });
    expect(order.payments[0].status).toBe(PaymentStatus.REFUNDED);
    expect(order.payments[0].refundedAmount).toBe(total);
    expect([OrderStatus.CANCELLED, OrderStatus.REFUNDED]).toContain(
      order.status,
    );
  });

  it('releases the coupon redemption', async () => {
    await prisma.coupon.create({
      data: { code: 'TENOFF', type: CouponType.PERCENT, value: 10 },
    });
    const { orderId } = await paidOrder(1, 5, 'TENOFF');
    const coupon = () =>
      prisma.coupon.findUniqueOrThrow({ where: { code: 'TENOFF' } });
    expect((await coupon()).usedCount).toBe(1);

    await setStatus(orderId, OrderStatus.CANCELLED).expect(200);

    expect((await coupon()).usedCount).toBe(0);
    expect(await prisma.couponRedemption.count({ where: { orderId } })).toBe(0);
  });

  it('does the same for a PROCESSING order', async () => {
    const { orderId, variantId } = await paidOrder(1, 4);
    await setStatus(orderId, OrderStatus.PROCESSING).expect(200);
    await setStatus(orderId, OrderStatus.CANCELLED).expect(200);
    expect(await stockOf(variantId)).toBe(4);
    expect(refundsCreate).toHaveBeenCalledTimes(1);
  });

  it('restocks only once when the cancel is sent twice', async () => {
    const { orderId, variantId } = await paidOrder(2, 5);
    const [a, b] = await Promise.all([
      setStatus(orderId, OrderStatus.CANCELLED),
      setStatus(orderId, OrderStatus.CANCELLED),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(await stockOf(variantId)).toBe(5);
    expect(refundsCreate).toHaveBeenCalledTimes(1);
  });

  it('keeps the order paid and in stock when the refund fails', async () => {
    const { orderId, variantId } = await paidOrder(2, 5);
    refundFails = true;
    await setStatus(orderId, OrderStatus.CANCELLED).expect(502);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: true },
    });
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(order.payments[0].status).toBe(PaymentStatus.SUCCEEDED);
    expect(await stockOf(variantId)).toBe(3);
  });
});
