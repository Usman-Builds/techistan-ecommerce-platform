import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/e2e';
import { resetDb, makeUser, makeProduct, makeDeliveredOrder } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Verified-purchase gating (script 13, FR-701). A review can only be posted by a
 * customer who has a delivered/completed order containing the product — proven
 * from order data, never self-asserted. Real DB end-to-end.
 */
const PASSWORD = 'Str0ng!pass';

async function login(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return res.body.accessToken;
}

describe('Review verified-purchase gating (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });

  it('rejects a review from a user with no delivered order (403)', async () => {
    await makeUser(prisma, { email: 'buyer@example.com', password: PASSWORD });
    const token = await login(app, 'buyer@example.com');
    const { product } = await makeProduct(prisma, { title: 'Widget' });

    await request(app.getHttpServer())
      .post('/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, rating: 5, body: 'Love it' })
      .expect(403);
  });

  it('accepts a review once a delivered order contains the product', async () => {
    const user = await makeUser(prisma, { email: 'realbuyer@example.com', password: PASSWORD });
    const token = await login(app, 'realbuyer@example.com');
    const { product, variant } = await makeProduct(prisma, { title: 'Gadget', priceCents: 2500 });

    await makeDeliveredOrder(prisma, {
      userId: user.id,
      email: user.email,
      variantId: variant.id,
      productTitle: product.title,
      sku: variant.sku,
      unitPriceCents: variant.price,
    });

    const res = await request(app.getHttpServer())
      .post('/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, rating: 4, title: 'Solid', body: 'Works well' })
      .expect(201);

    expect(res.body).toMatchObject({ rating: 4, status: 'PENDING' }); // hidden until moderated
    const count = await prisma.review.count({ where: { productId: product.id } });
    expect(count).toBe(1);
  });

  it('rejects a second review of the same product by the same user (409)', async () => {
    const user = await makeUser(prisma, { email: 'dupe@example.com', password: PASSWORD });
    const token = await login(app, 'dupe@example.com');
    const { product, variant } = await makeProduct(prisma, { title: 'Gizmo' });
    await makeDeliveredOrder(prisma, {
      userId: user.id,
      email: user.email,
      variantId: variant.id,
      productTitle: product.title,
      sku: variant.sku,
      unitPriceCents: variant.price,
    });

    const post = () =>
      request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product.id, rating: 5, body: 'first' });

    await post().expect(201);
    await post().expect(409);
  });
});
