import * as bcrypt from 'bcrypt';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Wipe every application table between suites so tests are order-independent.
 * `_prisma_migrations` is preserved (schema stays migrated); `RESTART IDENTITY`
 * resets the User serial so ids are predictable. This only ever runs against
 * ecom_test (guarded in setup-e2e.ts).
 */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const tables = rows
    .map((r) => r.tablename)
    .filter((t) => t !== '_prisma_migrations');
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

const HASH_ROUNDS = 4; // fast bcrypt for tests only

/** Create a LOCAL user (verified + ACTIVE by default) with a known password. */
export async function makeUser(
  prisma: PrismaService,
  opts: {
    email: string;
    password: string;
    role?: Role;
    verified?: boolean;
    firstName?: string;
    lastName?: string;
  },
) {
  return prisma.user.create({
    data: {
      firstName: opts.firstName ?? 'Test',
      lastName: opts.lastName ?? 'User',
      email: opts.email,
      password: await bcrypt.hash(opts.password, HASH_ROUNDS),
      provider: 'LOCAL',
      role: opts.role ?? Role.CUSTOMER,
      emailVerified: opts.verified === false ? null : new Date(),
    },
  });
}

/** Seed a single-variant product with stock; returns { product, variant }. */
export async function makeProduct(
  prisma: PrismaService,
  opts: { title?: string; priceCents?: number; stock?: number } = {},
) {
  const suffix = Math.floor(Math.random() * 1e9).toString(36);
  const product = await prisma.product.create({
    data: {
      title: opts.title ?? 'Test Product',
      slug: `test-product-${suffix}`,
      status: 'ACTIVE',
      variants: {
        create: {
          sku: `SKU-${suffix}`,
          price: opts.priceCents ?? 1999,
          stock: opts.stock ?? 10,
          options: { Size: 'M' } as Prisma.InputJsonValue,
        },
      },
    },
    include: { variants: true },
  });
  return { product, variant: product.variants[0] };
}

const ADDRESS = {
  fullName: 'Jane Buyer',
  line1: '1 Market St',
  city: 'Springfield',
  state: 'CA',
  postalCode: '90001',
  country: 'US',
};

/** Seed a cart (for a user or a guest session) with one line item. */
export async function makeCartWithItem(
  prisma: PrismaService,
  opts: {
    userId?: number;
    sessionId?: string;
    productId: string;
    variantId: string;
    quantity?: number;
    unitPriceCents: number;
  },
) {
  return prisma.cart.create({
    data: {
      userId: opts.userId,
      sessionId: opts.sessionId,
      items: {
        create: {
          productId: opts.productId,
          variantId: opts.variantId,
          quantity: opts.quantity ?? 1,
          unitPriceCents: opts.unitPriceCents,
        },
      },
    },
    include: { items: true },
  });
}

/** Seed a DELIVERED order for a user containing a variant (review eligibility). */
export async function makeDeliveredOrder(
  prisma: PrismaService,
  opts: {
    userId: number;
    email: string;
    variantId: string;
    productTitle: string;
    sku: string;
    unitPriceCents: number;
  },
) {
  const suffix = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return prisma.order.create({
    data: {
      orderNumber: `ORD-TEST-${suffix}`,
      userId: opts.userId,
      email: opts.email,
      status: OrderStatus.DELIVERED,
      subtotal: opts.unitPriceCents,
      grandTotal: opts.unitPriceCents,
      shippingAddress: ADDRESS as unknown as Prisma.InputJsonValue,
      billingAddress: ADDRESS as unknown as Prisma.InputJsonValue,
      items: {
        create: {
          variantId: opts.variantId,
          productTitle: opts.productTitle,
          variantOptions: { Size: 'M' } as Prisma.InputJsonValue,
          sku: opts.sku,
          quantity: 1,
          unitPrice: opts.unitPriceCents,
          total: opts.unitPriceCents,
        },
      },
    },
  });
}

export const TEST_ADDRESS = ADDRESS;
