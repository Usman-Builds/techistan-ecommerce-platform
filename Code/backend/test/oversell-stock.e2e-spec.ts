import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrderService } from '../src/modules/order/order.service';
import { PaymentService } from '../src/modules/payment/payment.service';
import { STRIPE_CLIENT } from '../src/modules/payment/stripe.provider';
import {
  resetDb,
  makeProduct,
  makeCartWithItem,
  TEST_ADDRESS,
} from './utils/db';

/**
 * #6: stock is checked at order creation but only decremented at payment. Two
 * shoppers can each open an order for the last unit; when both pay, only one
 * may take the stock. The other is refunded and stock never goes below 0.
 * Real DB, so the row-level guard is exercised for real; Stripe is stubbed.
 */
describe('Stock floor at payment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrderService;
  let payments: PaymentService;
  let intentSeq = 0;
  const refundsCreate = jest.fn(() =>
    Promise.resolve({ id: `re_${Math.random().toString(36).slice(2)}` }),
  );

  beforeAll(async () => {
    const stripe = {
      paymentIntents: {
        create: jest.fn(() => {
          intentSeq += 1;
          return Promise.resolve({
            id: `pi_oversell_${intentSeq}`,
            client_secret: `cs_${intentSeq}`,
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

  beforeEach(async () => {
    await resetDb(prisma);
    refundsCreate.mockClear();
  });

  async function openOrder(
    variant: { id: string; price: number },
    productId: string,
    key: string,
  ) {
    const cart = await makeCartWithItem(prisma, {
      sessionId: `s-${key}`,
      productId,
      variantId: variant.id,
      quantity: 1,
      unitPriceCents: variant.price,
    });
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
    return { orderId: order.id, intentId: payment.stripePaymentIntentId! };
  }

  const succeeded = (intentId: string, n: number) =>
    ({
      id: `evt_oversell_${n}`,
      type: 'payment_intent.succeeded',
      data: { object: { id: intentId, payment_method_types: ['card'] } },
    }) as unknown as Stripe.Event;

  it('lets only one of two orders for the last unit take the stock', async () => {
    const { product, variant } = await makeProduct(prisma, {
      priceCents: 2500,
      stock: 1,
    });
    const a = await openOrder(variant, product.id, 'shopper-a');
    const b = await openOrder(variant, product.id, 'shopper-b');

    await Promise.all([
      payments.handleEvent(succeeded(a.intentId, 1)),
      payments.handleEvent(succeeded(b.intentId, 2)),
    ]);

    const after = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    });
    expect(after.stock).toBe(0);

    const statuses = (
      await prisma.order.findMany({
        where: { id: { in: [a.orderId, b.orderId] } },
        select: { status: true },
      })
    )
      .map((o) => o.status)
      .sort();
    expect(statuses).toEqual(
      [OrderStatus.CONFIRMED, OrderStatus.REFUNDED].sort(),
    );
    expect(refundsCreate).toHaveBeenCalledTimes(1);
  });

  it('refunds a payment that arrives after the stock ran out', async () => {
    const { product, variant } = await makeProduct(prisma, {
      priceCents: 2500,
      stock: 1,
    });
    const a = await openOrder(variant, product.id, 'first');
    const b = await openOrder(variant, product.id, 'second');

    await payments.handleEvent(succeeded(a.intentId, 1));
    await payments.handleEvent(succeeded(b.intentId, 2));

    const late = await prisma.order.findUniqueOrThrow({
      where: { id: b.orderId },
      include: { payments: true },
    });
    expect(late.status).toBe(OrderStatus.REFUNDED);
    expect(late.payments[0].status).toBe(PaymentStatus.REFUNDED);
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variant.id },
        })
      ).stock,
    ).toBe(0);
  });

  it('rejects a negative stock value at the database', async () => {
    const { variant } = await makeProduct(prisma, { stock: 0 });
    await expect(
      prisma.productVariant.update({
        where: { id: variant.id },
        data: { stock: { decrement: 1 } },
      }),
    ).rejects.toThrow();
  });
});
