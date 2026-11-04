import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/e2e';
import { makeProduct, resetDb } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * #31: search prices, filters, facets and sorts use the effective (sale-aware)
 * price, the same price the catalogue, product page, cart and checkout charge.
 * Real DB, so the SQL expression is exercised for real.
 */
type Card = {
  slug: string;
  priceMin: number | null;
  priceMax: number | null;
  onSale: boolean;
};
type Result = { items: Card[]; total: number };

describe('Search sale prices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  let saleSlug: string;
  let fullSlug: string;
  let expiredSlug: string;

  beforeEach(async () => {
    await resetDb(prisma);
    const day = 24 * 60 * 60 * 1000;
    // On sale now: regular 600.00, sale 450.00.
    const sale = await makeProduct(prisma, {
      title: 'Forge Mini PC',
      priceCents: 60000,
    });
    await prisma.productVariant.update({
      where: { id: sale.variant.id },
      data: {
        salePrice: 45000,
        saleStartsAt: new Date(Date.now() - day),
        saleEndsAt: new Date(Date.now() + day),
      },
    });
    // Never on sale: 500.00.
    const full = await makeProduct(prisma, {
      title: 'Forge Tower PC',
      priceCents: 50000,
    });
    // Sale window already over: still 550.00.
    const expired = await makeProduct(prisma, {
      title: 'Forge Laptop PC',
      priceCents: 55000,
    });
    await prisma.productVariant.update({
      where: { id: expired.variant.id },
      data: {
        salePrice: 30000,
        saleStartsAt: new Date(Date.now() - 3 * day),
        saleEndsAt: new Date(Date.now() - day),
      },
    });
    saleSlug = sale.product.slug;
    fullSlug = full.product.slug;
    expiredSlug = expired.product.slug;
  });

  const search = async (qs: string) =>
    (await http().get(`/search?q=forge${qs}`).expect(200)).body as Result;

  it('shows the sale price and flags the card as on sale', async () => {
    const { items } = await search('');
    const sale = items.find((i) => i.slug === saleSlug);
    expect(sale).toMatchObject({
      priceMin: 45000,
      priceMax: 45000,
      onSale: true,
    });
    expect(items.find((i) => i.slug === expiredSlug)).toMatchObject({
      priceMin: 55000,
      onSale: false,
    });
  });

  it('filters by the effective price', async () => {
    const { items } = await search('&maxPrice=48000');
    expect(items.map((i) => i.slug)).toEqual([saleSlug]);
  });

  it('sorts by the effective price', async () => {
    const { items } = await search('&sort=price_asc');
    expect(items.map((i) => i.slug)).toEqual([saleSlug, fullSlug, expiredSlug]);
  });

  it('buckets the price facet by the effective price', async () => {
    // Regular 60.00 (the 50–100 bucket), on sale for 40.00 (the 25–50 bucket).
    const cable = await makeProduct(prisma, {
      title: 'Forge Cable',
      priceCents: 6000,
    });
    await prisma.productVariant.update({
      where: { id: cable.variant.id },
      data: { salePrice: 4000 },
    });
    const res = await http().get('/search/facets?q=forge').expect(200);
    const buckets = (
      res.body as { priceBuckets: { min: number; count: number }[] }
    ).priceBuckets;
    expect(buckets.find((b) => b.min === 2500)?.count).toBe(1);
    expect(buckets.find((b) => b.min === 5000)?.count).toBe(0);
  });
});
