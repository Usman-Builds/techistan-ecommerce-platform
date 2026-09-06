import { PrismaClient } from '@prisma/client';
import { loadSeedEnv, seedAdmin } from './admin';

// Ensure ADMIN_* (and DATABASE_URL) are loaded before the client is used.
loadSeedEnv();

const prisma = new PrismaClient();

/**
 * Real, reachability-verified product photography (see prisma/seed-demo.ts for
 * the full verified set and the verification note).
 *
 * The categories carry images too, not just the product: the storefront renders
 * categories as photographic poster tiles (homepage rail, category page header,
 * mega-menu panel), and a category with a null `imageUrl` falls back to a flat
 * gradient. That fallback exists for a reason, but a bare `prisma db seed`
 * shouldn't be the thing that shows it off.
 */
const PHOTO = {
  headphonesWhiteBg:
    'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=1000&q=80&auto=format&fit=crop',
  headphonesStand:
    'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=1000&q=80&auto=format&fit=crop',
};

async function main() {
  // 1. Store settings singleton
  await prisma.storeSetting.upsert({
    where: { singleton: true },
    update: {},
    create: { singleton: true, name: 'Techistan', currency: 'USD' },
  });

  // 2. Category tree
  const audio = await prisma.category.upsert({
    where: { slug: 'audio' },
    update: { imageUrl: PHOTO.headphonesStand },
    create: {
      name: 'Audio',
      slug: 'audio',
      sortOrder: 1,
      imageUrl: PHOTO.headphonesStand,
    },
  });
  const headphones = await prisma.category.upsert({
    where: { slug: 'headphones' },
    update: { imageUrl: PHOTO.headphonesWhiteBg },
    create: {
      name: 'Headphones',
      slug: 'headphones',
      parentId: audio.id,
      sortOrder: 1,
      imageUrl: PHOTO.headphonesWhiteBg,
    },
  });

  // 3. Sample product + image + variant
  const product = await prisma.product.upsert({
    where: { slug: 'anc-over-ear-headphones' },
    update: {},
    create: {
      title: 'ANC Over-Ear Headphones',
      slug: 'anc-over-ear-headphones',
      description:
        'Active noise-cancelling over-ear headphones with 30-hour battery life.',
      status: 'ACTIVE',
      categoryId: headphones.id,
    },
  });
  const hasImage = await prisma.productImage.findFirst({
    where: { productId: product.id },
    select: { id: true },
  });
  if (!hasImage) {
    await prisma.productImage.create({
      data: {
        productId: product.id,
        cloudinaryPublicId: 'techistan/seed/anc-over-ear-headphones',
        url: PHOTO.headphonesWhiteBg,
        alt: 'Black over-ear noise-cancelling headphones',
        position: 0,
        width: 1000,
        height: 1000,
      },
    });
  }
  await prisma.productVariant.upsert({
    where: { sku: 'ANC-OE-BLK' },
    update: {},
    create: {
      productId: product.id,
      sku: 'ANC-OE-BLK',
      price: 19999, // $199.99 in cents
      stock: 100,
      options: { Color: 'Black' },
    },
  });

  // 4. Admin user (script 05) — idempotent SUPER_ADMIN from ADMIN_EMAIL/PASSWORD.
  await seedAdmin(prisma);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
