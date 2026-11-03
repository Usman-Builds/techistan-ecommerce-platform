import { INestApplication } from '@nestjs/common';
import { createTestApp } from './utils/e2e';
import { resetDb, makeUser, makeProduct } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';
import { CartService } from '../src/modules/cart/cart.service';

/**
 * #54: cart writes race safely. Concurrent first writes for a new customer all
 * land on one cart (no 500 on the unique userId), and concurrent adds of the
 * same variant all count, still clamped to stock. Real DB, real races.
 */
describe('Cart concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let carts: CartService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    carts = app.get(CartService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });

  it('creates exactly one cart for concurrent first writes', async () => {
    const user = await makeUser(prisma, {
      email: 'new@example.com',
      password: 'Str0ng!pass',
    });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => carts.getOrCreateUserCart(user.id)),
    );
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const ids = new Set(
      results.map(
        (r) => (r as PromiseFulfilledResult<{ id: string }>).value.id,
      ),
    );
    expect(ids.size).toBe(1);
    expect(await prisma.cart.count({ where: { userId: user.id } })).toBe(1);
  });

  it('counts every one of several concurrent adds of the same variant', async () => {
    const user = await makeUser(prisma, {
      email: 'adder@example.com',
      password: 'Str0ng!pass',
    });
    const cart = await carts.getOrCreateUserCart(user.id);
    const { variant } = await makeProduct(prisma, { stock: 20 });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => carts.addItem(cart.id, variant.id, 1)),
    );

    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);
    const line = await prisma.cartItem.findUniqueOrThrow({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
    });
    expect(line.quantity).toBe(5);
  });

  it('still clamps concurrent adds to the stock on hand', async () => {
    const user = await makeUser(prisma, {
      email: 'clamp@example.com',
      password: 'Str0ng!pass',
    });
    const cart = await carts.getOrCreateUserCart(user.id);
    const { variant } = await makeProduct(prisma, { stock: 3 });

    await Promise.allSettled(
      Array.from({ length: 5 }, () => carts.addItem(cart.id, variant.id, 2)),
    );

    const line = await prisma.cartItem.findUniqueOrThrow({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
    });
    expect(line.quantity).toBe(3);
  });
});
