import { BadRequestException, INestApplication } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { createTestApp } from './utils/e2e';
import {
  resetDb,
  makeUser,
  makeProduct,
  makeCartWithItem,
  makeDeliveredOrder,
} from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductService } from '../src/modules/product/product.service';

/**
 * #27: saving a product diffs its variants instead of deleting and recreating
 * them. An unchanged variant keeps its id, SKU, stock, sale and every link to
 * it (cart lines, order items); only added or removed variants change. Real DB.
 */
describe('Product variant update (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let products: ProductService;
  const day = 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    products = app.get(ProductService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });

  /** What the admin editor sends back for a variant it loaded unchanged. */
  const asInput = (v: {
    sku: string;
    price: number;
    stock: number;
    options: unknown;
  }) => ({
    sku: v.sku,
    price: v.price,
    stock: v.stock,
    options: v.options as Record<string, string>,
  });

  async function scenario() {
    const shopper = await makeUser(prisma, {
      email: 'shopper@example.com',
      password: 'Str0ng!pass',
    });
    const { product, variant } = await makeProduct(prisma, {
      title: 'Lamp',
      priceCents: 5000,
      stock: 10,
    });
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: {
        sku: 'ABC',
        salePrice: 4000,
        saleStartsAt: new Date(Date.now() + day),
        saleEndsAt: new Date(Date.now() + 3 * day),
      },
    });
    const v = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    });
    const cart = await makeCartWithItem(prisma, {
      userId: shopper.id,
      productId: product.id,
      variantId: v.id,
      quantity: 1,
      unitPriceCents: v.price,
    });
    const order = await makeDeliveredOrder(prisma, {
      userId: shopper.id,
      email: shopper.email,
      variantId: v.id,
      productTitle: product.title,
      sku: v.sku,
      unitPriceCents: v.price,
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PENDING },
    });
    return { product, v, cart, order };
  }

  it('keeps an unchanged variant intact when only the description changes', async () => {
    const { product, v, cart, order } = await scenario();

    await products.update(product.id, {
      description: 'Now with a brighter bulb.',
      variants: [asInput(v)],
    } as never);

    const after = await prisma.productVariant.findMany({
      where: { productId: product.id },
    });
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: v.id,
      sku: 'ABC',
      stock: 10,
      salePrice: 4000,
    });
    expect(after[0].saleStartsAt).toEqual(v.saleStartsAt);
    expect(
      await prisma.cartItem.count({
        where: { cartId: cart.id, variantId: v.id },
      }),
    ).toBe(1);
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(item.variantId).toBe(v.id);
  });

  it('applies edits to a kept variant in place', async () => {
    const { product, v } = await scenario();
    await prisma.productVariant.update({
      where: { id: v.id },
      data: { compareAtPrice: 7000, barcode: '0123456789' },
    });
    await products.update(product.id, {
      variants: [{ ...asInput(v), price: 5500, stock: 7 }],
    } as never);
    const after = await prisma.productVariant.findUniqueOrThrow({
      where: { id: v.id },
    });
    expect(after).toMatchObject({ price: 5500, stock: 7, sku: 'ABC' });
    // Compare-at left blank in the editor clears it; barcode isn't edited there.
    expect(after.compareAtPrice).toBeNull();
    expect(after.barcode).toBe('0123456789');
  });

  it('renames a kept variant’s SKU only when a different one is sent', async () => {
    const { product, v } = await scenario();
    await products.update(product.id, {
      variants: [{ ...asInput(v), sku: 'lamp-m' }],
    } as never);
    const after = await prisma.productVariant.findUniqueOrThrow({
      where: { id: v.id },
    });
    expect(after.sku).toBe('LAMP-M');
  });

  it('creates added variants and deletes removed ones that no open order needs', async () => {
    const { product, v } = await scenario();
    // Add Size L next to the existing Size M.
    await products.update(product.id, {
      variants: [asInput(v), { price: 6000, stock: 3, options: { Size: 'L' } }],
    } as never);
    const two = await prisma.productVariant.findMany({
      where: { productId: product.id },
      orderBy: { price: 'asc' },
    });
    expect(two.map((x) => x.id)[0]).toBe(v.id);
    expect(two).toHaveLength(2);

    // Now drop the new one (no orders reference it).
    await products.update(product.id, { variants: [asInput(v)] } as never);
    const one = await prisma.productVariant.findMany({
      where: { productId: product.id },
    });
    expect(one.map((x) => x.id)).toEqual([v.id]);
  });

  it('refuses to remove a variant that an open order still needs', async () => {
    const { product, v } = await scenario();
    await expect(
      products.update(product.id, {
        variants: [{ price: 6000, stock: 3, options: { Size: 'L' } }],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      await prisma.productVariant.findUnique({ where: { id: v.id } }),
    ).not.toBeNull();
  });
});
