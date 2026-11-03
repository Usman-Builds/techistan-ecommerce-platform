import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentService } from '../src/modules/payment/payment.service';
import { OrderService } from '../src/modules/order/order.service';
import { EmailService } from '../src/modules/email/email.service';
import { AbandonedCartService } from '../src/modules/cron/abandoned-cart.service';
import {
  resetDb,
  makeUser,
  makeProduct,
  makeCartWithItem,
  TEST_ADDRESS,
} from './utils/db';

/**
 * #48: a guest's checkout email is stored on their cart (Cart.guestEmail), so
 * abandoned-cart recovery can reach guests too (FR-306). Stripe is stubbed;
 * OrderService and the recovery job run against the real ecom_test DB.
 */
describe('Guest cart email capture (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrderService;
  let recovery: AbandonedCartService;
  const sendAbandonedCart = jest.fn(() => Promise.resolve());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(PaymentService)
      .useValue({
        createIntent: () => Promise.resolve({ clientSecret: 'cs_test_stub' }),
        getClientSecret: () => Promise.resolve('cs_test_stub'),
      })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    orders = app.get(OrderService);
    recovery = app.get(AbandonedCartService);
    jest
      .spyOn(app.get(EmailService), 'sendAbandonedCart')
      .mockImplementation(sendAbandonedCart);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    sendAbandonedCart.mockClear();
  });

  async function cartFor(opts: { userId?: number; sessionId?: string }) {
    const { product, variant } = await makeProduct(prisma, {
      priceCents: 2500,
      stock: 10,
    });
    return makeCartWithItem(prisma, {
      ...opts,
      productId: product.id,
      variantId: variant.id,
      quantity: 1,
      unitPriceCents: variant.price,
    });
  }

  const dto = (email: string, key: string) =>
    ({
      email,
      idempotencyKey: key,
      shippingAddress: TEST_ADDRESS,
    }) as never;

  it('stores the guest checkout email on the cart', async () => {
    const cart = await cartFor({ sessionId: 'guest-session-1' });
    await orders.createOrder(
      dto('guest@example.com', 'guest-key-1'),
      null,
      cart.id,
    );
    const saved = await prisma.cart.findUniqueOrThrow({
      where: { id: cart.id },
    });
    expect(saved.guestEmail).toBe('guest@example.com');
  });

  it('lets the recovery job email a guest who left after entering their email', async () => {
    const cart = await cartFor({ sessionId: 'guest-session-2' });
    await orders.createOrder(
      dto('guest2@example.com', 'guest-key-2'),
      null,
      cart.id,
    );

    // Two hours later, still unpaid (the cart keeps its items).
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const result = await recovery.run(later);

    expect(result.firstSent).toBe(1);
    expect(sendAbandonedCart).toHaveBeenCalledWith(
      'guest2@example.com',
      expect.anything(),
    );
  });

  it('does not set guestEmail on a signed-in customer’s cart', async () => {
    const user = await makeUser(prisma, {
      email: 'member@example.com',
      password: 'Str0ng!pass',
    });
    const cart = await cartFor({ userId: user.id });
    await orders.createOrder(
      dto('other@example.com', 'member-key'),
      user.id,
      cart.id,
    );
    const saved = await prisma.cart.findUniqueOrThrow({
      where: { id: cart.id },
    });
    expect(saved.guestEmail).toBeNull();
  });
});
