import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ProductStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentService } from '../src/modules/payment/payment.service';
import { OrderService } from '../src/modules/order/order.service';
import { CartService } from '../src/modules/cart/cart.service';
import {
  resetDb,
  makeUser,
  makeProduct,
  makeCartWithItem,
  TEST_ADDRESS,
} from './utils/db';

/**
 * #15: only ACTIVE products can be bought. A DRAFT/ARCHIVED product's variant
 * must be rejected when added to the cart, shown as unavailable (and left out
 * of the totals) if it is already in a cart, and refused at checkout.
 */
describe('Inactive products in the cart (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrderService;
  let carts: CartService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      // Stub Stripe so checkout completes offline.
      .overrideProvider(PaymentService)
      .useValue({
        createIntent: () =>
          Promise.resolve({
            clientSecret: 'cs_test_stub',
            paymentIntentId: 'pi_stub',
          }),
        getClientSecret: () => Promise.resolve('cs_test_stub'),
      })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    prisma = app.get(PrismaService);
    orders = app.get(OrderService);
    carts = app.get(CartService);
  });
  afterAll(async () => {
    await app.close();
  });

  async function seed(status: ProductStatus) {
    await resetDb(prisma);
    const user = await makeUser(prisma, {
      email: 'shopper@example.com',
      password: 'Str0ng!pass',
    });
    const { product, variant } = await makeProduct(prisma, {
      priceCents: 2500,
      stock: 10,
    });
    // The line was added while the product was ACTIVE...
    const cart = await makeCartWithItem(prisma, {
      userId: user.id,
      productId: product.id,
      variantId: variant.id,
      quantity: 2,
      unitPriceCents: variant.price,
    });
    // ...then the merchant unpublished it.
    await prisma.product.update({
      where: { id: product.id },
      data: { status },
    });
    return { user, product, variant, cart };
  }

  it.each([ProductStatus.DRAFT, ProductStatus.ARCHIVED])(
    'rejects adding a %s product to a cart',
    async (status) => {
      const { variant, user } = await seed(status);
      const other = await prisma.cart.create({ data: { sessionId: 's-1' } });
      await expect(
        carts.addItem(other.id, variant.id, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await prisma.cartItem.count({ where: { cartId: other.id } })).toBe(
        0,
      );
      expect(user).toBeDefined();
    },
  );

  it('marks an archived line unavailable and leaves it out of totals', async () => {
    const { cart } = await seed(ProductStatus.ARCHIVED);
    const view = await carts.buildView(cart.id);
    expect(view.items).toHaveLength(1);
    expect(view.items[0].availability).toMatchObject({
      outOfStock: true,
      available: 0,
    });
    expect(view.subtotal).toBe(0);
    expect(view.itemCount).toBe(0);
  });

  it('refuses checkout when a line is no longer ACTIVE', async () => {
    const { cart, user } = await seed(ProductStatus.ARCHIVED);
    await expect(
      orders.createOrder(
        {
          email: 'shopper@example.com',
          idempotencyKey: 'inactive-1',
          shippingAddress: TEST_ADDRESS,
        } as never,
        user.id,
        cart.id,
      ),
    ).rejects.toThrow(/no longer available/);
    expect(await prisma.order.count()).toBe(0);
  });

  it('still checks out an ACTIVE product', async () => {
    const { cart, user } = await seed(ProductStatus.ACTIVE);
    const res = await orders.createOrder(
      {
        email: 'shopper@example.com',
        idempotencyKey: 'active-1',
        shippingAddress: TEST_ADDRESS,
      } as never,
      user.id,
      cart.id,
    );
    expect(res.order.subtotal).toBe(5000);
  });
});
