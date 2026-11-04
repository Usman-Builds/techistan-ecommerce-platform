import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PaymentStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrderService } from '../src/modules/order/order.service';
import { STRIPE_CLIENT } from '../src/modules/payment/stripe.provider';
import {
  resetDb,
  makeProduct,
  makeCartWithItem,
  TEST_ADDRESS,
} from './utils/db';

/**
 * Retried checkout submissions (FR-406), real DB with Stripe stubbed:
 * - #12: two concurrent submits with the same idempotency key both get the
 *   same order, instead of the loser hitting the unique constraint (500).
 * - #11: when Stripe failed to create the PaymentIntent, the retry creates it
 *   and returns its client secret instead of `null` (a dead-end payment form).
 */
describe('Checkout retries (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrderService;
  let failNextIntent = false;
  const intentsCreate = jest.fn(
    (_params: unknown, opts?: { idempotencyKey?: string }) => {
      if (failNextIntent) {
        failNextIntent = false;
        return Promise.reject(new Error('Stripe timeout'));
      }
      const id = `pi_${opts?.idempotencyKey ?? Math.random()}`;
      return Promise.resolve({ id, client_secret: `cs_${id}` });
    },
  );

  beforeAll(async () => {
    const stripe = {
      paymentIntents: {
        create: intentsCreate,
        retrieve: jest.fn((id: string) =>
          Promise.resolve({ id, client_secret: `cs_${id}` }),
        ),
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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    intentsCreate.mockClear();
    failNextIntent = false;
  });

  async function cart() {
    const { product, variant } = await makeProduct(prisma, {
      priceCents: 1999,
      stock: 10,
    });
    return makeCartWithItem(prisma, {
      sessionId: `s-${Math.random().toString(36).slice(2)}`,
      productId: product.id,
      variantId: variant.id,
      quantity: 1,
      unitPriceCents: variant.price,
    });
  }
  const dto = (key: string) =>
    ({
      email: 'retry@example.com',
      idempotencyKey: key,
      shippingAddress: TEST_ADDRESS,
    }) as never;

  it('returns the same order to two concurrent submits with one key (#12)', async () => {
    const c = await cart();
    const [a, b] = await Promise.all([
      orders.createOrder(dto('double-click'), null, c.id),
      orders.createOrder(dto('double-click'), null, c.id),
    ]);
    expect(b.order.id).toBe(a.order.id);
    expect(await prisma.order.count()).toBe(1);
    expect(a.clientSecret).toBeTruthy();
    expect(b.clientSecret).toBeTruthy();
  });

  it('creates the missing PaymentIntent when the retry follows a Stripe failure (#11)', async () => {
    const c = await cart();
    failNextIntent = true;
    await expect(orders.createOrder(dto('blip'), null, c.id)).rejects.toThrow(
      'Stripe timeout',
    );
    const stuck = await prisma.payment.findFirstOrThrow();
    expect(stuck.stripePaymentIntentId).toBeNull();

    const retry = await orders.createOrder(dto('blip'), null, c.id);

    expect(retry.clientSecret).toBe('cs_pi_pi_blip');
    const payment = await prisma.payment.findFirstOrThrow();
    expect(payment.stripePaymentIntentId).toBe('pi_pi_blip');
    expect(payment.status).toBe(PaymentStatus.PROCESSING);
    // Both attempts used the same Stripe idempotency key.
    expect(intentsCreate.mock.calls.map((call) => call[1])).toEqual([
      { idempotencyKey: 'pi_blip' },
      { idempotencyKey: 'pi_blip' },
    ]);
    expect(await prisma.order.count()).toBe(1);
  });
});
