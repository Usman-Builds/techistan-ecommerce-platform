import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Role } from '@prisma/client';
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
 * #16: the admin low-stock alert must fire when a sale takes stock across the
 * threshold, not only when an admin edits stock by hand. Real DB; Stripe is
 * stubbed and the payment success is delivered as a webhook event.
 */
describe('Low-stock alert on sale (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrderService;
  let payments: PaymentService;
  let seq = 0;

  beforeAll(async () => {
    const stripe = {
      paymentIntents: {
        create: jest.fn(() => {
          seq += 1;
          return Promise.resolve({
            id: `pi_lowstock_${seq}`,
            client_secret: `cs_${seq}`,
          });
        }),
      },
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
    await makeUser(prisma, {
      email: 'admin@example.com',
      password: 'Str0ng!pass',
      role: Role.ADMIN,
    });
  });

  async function sell(
    variant: { id: string; price: number },
    productId: string,
    quantity: number,
  ) {
    seq += 1;
    const key = `lowstock-${seq}`;
    const cart = await makeCartWithItem(prisma, {
      sessionId: `s-${key}`,
      productId,
      variantId: variant.id,
      quantity,
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
  }

  /** The alert is sent after commit, fire-and-forget; give it a moment. */
  async function lowStockAlerts(expected: number) {
    for (let i = 0; i < 20; i++) {
      const n = await prisma.notification.count({
        where: { type: 'ADMIN_LOW_STOCK' },
      });
      if (n >= expected) return n;
      await new Promise((r) => setTimeout(r, 100));
    }
    return prisma.notification.count({ where: { type: 'ADMIN_LOW_STOCK' } });
  }

  it('alerts the admin once when a sale crosses the threshold', async () => {
    // Default threshold is 5.
    const { product, variant } = await makeProduct(prisma, {
      title: 'Desk Lamp',
      stock: 6,
    });

    await sell(variant, product.id, 2); // 6 → 4: crosses
    expect(await lowStockAlerts(1)).toBe(1);
    const alert = await prisma.notification.findFirstOrThrow({
      where: { type: 'ADMIN_LOW_STOCK' },
    });
    expect(alert.title).toContain('Desk Lamp');
    expect(alert.body).toContain('down to 4');

    await sell(variant, product.id, 1); // 4 → 3: already low, no new alert
    await new Promise((r) => setTimeout(r, 300));
    expect(await lowStockAlerts(1)).toBe(1);
  });

  it('does not alert while stock stays above the threshold', async () => {
    const { product, variant } = await makeProduct(prisma, { stock: 20 });
    await sell(variant, product.id, 3); // 20 → 17
    await new Promise((r) => setTimeout(r, 300));
    expect(await lowStockAlerts(0)).toBe(0);
  });
});
