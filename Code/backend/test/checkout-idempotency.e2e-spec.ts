import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentService } from '../src/modules/payment/payment.service';
import { OrderService } from '../src/modules/order/order.service';
import {
  resetDb,
  makeUser,
  makeProduct,
  makeCartWithItem,
  TEST_ADDRESS,
} from './utils/db';

/**
 * Checkout idempotency (script 10, FR-406). Submitting the same idempotency key
 * twice must produce exactly ONE order. Stripe is stubbed (no network / test key
 * needed) so the assertion is purely about the server-side dedupe + the unique
 * idempotencyKey constraint. Drives OrderService against the real ecom_test DB.
 */
describe('Checkout idempotency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrderService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      // Stub Stripe so checkout completes offline.
      .overrideProvider(PaymentService)
      .useValue({
        createIntent: async () => ({ clientSecret: 'cs_test_stub', paymentIntentId: 'pi_stub' }),
        getClientSecret: async () => 'cs_test_stub',
      })
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    orders = app.get(OrderService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a single order when the same idempotency key is submitted twice', async () => {
    await resetDb(prisma);
    const user = await makeUser(prisma, { email: 'checkout@example.com', password: 'Str0ng!pass' });
    const { product, variant } = await makeProduct(prisma, { priceCents: 1999, stock: 10 });
    const cart = await makeCartWithItem(prisma, {
      userId: user.id,
      productId: product.id,
      variantId: variant.id,
      quantity: 2,
      unitPriceCents: variant.price,
    });

    const dto = {
      email: 'checkout@example.com',
      idempotencyKey: 'key-fixed-123',
      shippingAddress: TEST_ADDRESS,
    } as never;

    const first = await orders.createOrder(dto, user.id, cart.id);
    const second = await orders.createOrder(dto, user.id, cart.id);

    // Same order returned both times.
    expect(second.order.id).toBe(first.order.id);
    expect(second.order.orderNumber).toBe(first.order.orderNumber);

    // And exactly one row exists in the database.
    const count = await prisma.order.count();
    expect(count).toBe(1);

    // Server recomputed money authoritatively (2 × 1999 subtotal, never trusting
    // the client): subtotal is correct and a grand total was set.
    expect(first.order.subtotal).toBe(3998);
    expect(first.order.grandTotal).toBeGreaterThan(0);
  });

  it('creates distinct orders for distinct idempotency keys', async () => {
    await resetDb(prisma);
    const user = await makeUser(prisma, { email: 'twokeys@example.com', password: 'Str0ng!pass' });
    const { product, variant } = await makeProduct(prisma, { priceCents: 1000, stock: 50 });

    const mkCart = () =>
      makeCartWithItem(prisma, {
        userId: undefined,
        sessionId: `s-${Math.random().toString(36).slice(2)}`,
        productId: product.id,
        variantId: variant.id,
        quantity: 1,
        unitPriceCents: variant.price,
      });

    const cartA = await mkCart();
    const cartB = await mkCart();

    const base = { email: 'twokeys@example.com', shippingAddress: TEST_ADDRESS };
    const a = await orders.createOrder({ ...base, idempotencyKey: 'A' } as never, null, cartA.id);
    const b = await orders.createOrder({ ...base, idempotencyKey: 'B' } as never, null, cartB.id);

    expect(a.order.id).not.toBe(b.order.id);
    expect(await prisma.order.count()).toBe(2);
  });
});
