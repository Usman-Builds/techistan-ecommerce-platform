import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/e2e';
import { makeProduct, resetDb } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * #29: the catalogue's price filter and price sorts use the effective
 * (sale-aware) price, the one the card displays and checkout charges. Real DB.
 */
type Page = {
  items: { slug: string; priceMin: number | null }[];
  total: number;
};

describe('Catalogue sale prices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const day = 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  let sale: string; // regular 60.00, on sale now for 40.00
  let mid: string; // 45.00, no sale
  let expired: string; // regular 30.00, sale for 10.00 that already ended
  let upcoming: string; // regular 55.00, sale for 20.00 that hasn't started

  beforeEach(async () => {
    await resetDb(prisma);
    const make = async (
      title: string,
      priceCents: number,
      sale?: { salePrice: number; startsInDays: number; endsInDays: number },
    ) => {
      const { product, variant } = await makeProduct(prisma, {
        title,
        priceCents,
      });
      if (sale) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: {
            salePrice: sale.salePrice,
            saleStartsAt: new Date(Date.now() + sale.startsInDays * day),
            saleEndsAt: new Date(Date.now() + sale.endsInDays * day),
          },
        });
      }
      return product.slug;
    };
    sale = await make('Sale Speaker', 6000, {
      salePrice: 4000,
      startsInDays: -1,
      endsInDays: 1,
    });
    mid = await make('Mid Speaker', 4500);
    expired = await make('Old Deal Speaker', 3000, {
      salePrice: 1000,
      startsInDays: -3,
      endsInDays: -1,
    });
    upcoming = await make('Soon Speaker', 5500, {
      salePrice: 2000,
      startsInDays: 1,
      endsInDays: 3,
    });
  });

  const list = async (qs: string) =>
    (await http().get(`/products?${qs}`).expect(200)).body as Page;

  it('includes a sale item in the price range it is actually sold at', async () => {
    const { items } = await list('maxPrice=5000');
    expect(items.map((i) => i.slug).sort()).toEqual(
      [sale, mid, expired].sort(),
    );
  });

  it('excludes items whose sale is over or not started yet', async () => {
    const { items } = await list('maxPrice=2500');
    expect(items.map((i) => i.slug)).toEqual([]);
    const ranged = await list('minPrice=5000');
    expect(ranged.items.map((i) => i.slug).sort()).toEqual([upcoming].sort());
  });

  it('sorts ascending by the effective price', async () => {
    const { items } = await list('sort=price_asc');
    expect(items.map((i) => i.slug)).toEqual([expired, sale, mid, upcoming]);
    expect(items.map((i) => i.priceMin)).toEqual([3000, 4000, 4500, 5500]);
  });

  it('sorts descending by the effective price, with filter and pagination', async () => {
    const { items, total } = await list(
      'sort=price_desc&maxPrice=5000&pageSize=2&page=1',
    );
    expect(total).toBe(3);
    expect(items.map((i) => i.slug)).toEqual([mid, sale]);
    const next = await list('sort=price_desc&maxPrice=5000&pageSize=2&page=2');
    expect(next.items.map((i) => i.slug)).toEqual([expired]);
  });
});
