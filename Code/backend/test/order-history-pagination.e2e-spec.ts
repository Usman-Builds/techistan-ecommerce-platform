import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './utils/e2e';
import { resetDb, makeUser, TEST_ADDRESS } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * #55: GET /orders (customer order history) is paginated like the admin list:
 * `page` / `pageSize` (default 20, max 50) and a `{ items, total, page,
 * pageSize }` envelope. Real DB end-to-end.
 */
const PASSWORD = 'Str0ng!pass';

describe('Customer order history pagination (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    const user = await makeUser(prisma, {
      email: 'history@example.com',
      password: PASSWORD,
    });
    const other = await makeUser(prisma, {
      email: 'other@example.com',
      password: PASSWORD,
    });
    const address = TEST_ADDRESS as unknown as Prisma.InputJsonValue;
    const order = (userId: number, n: number) => ({
      orderNumber: `ORD-HIST-${userId}-${String(n).padStart(3, '0')}`,
      userId,
      email: 'history@example.com',
      subtotal: 1000,
      grandTotal: 1000,
      shippingAddress: address,
      billingAddress: address,
      // Distinct, increasing timestamps so "most recent first" is testable.
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, n)),
    });
    await prisma.order.createMany({
      data: [
        ...Array.from({ length: 25 }, (_, i) => order(user.id, i + 1)),
        order(other.id, 1),
      ],
    });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    token = (res.body as { accessToken: string }).accessToken;
  });

  type Page = {
    items: { orderNumber: string }[];
    total: number;
    page: number;
    pageSize: number;
  };
  const get = (qs = '') =>
    request(app.getHttpServer())
      .get(`/orders${qs}`)
      .set('Authorization', `Bearer ${token}`);

  it('returns the first 20 of the customer’s own orders by default', async () => {
    const res = await get().expect(200);
    const body = res.body as Page;
    expect(body.total).toBe(25);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(body.items).toHaveLength(20);
    expect(body.items[0].orderNumber).toMatch(/-025$/); // newest first
  });

  it('returns the remainder on the next page', async () => {
    const res = await get('?page=2').expect(200);
    const body = res.body as Page;
    expect(body.items).toHaveLength(5);
    expect(body.items[4].orderNumber).toMatch(/-001$/);
  });

  it('honours pageSize up to 50 and rejects larger pages', async () => {
    const res = await get('?pageSize=10&page=3').expect(200);
    expect((res.body as Page).items).toHaveLength(5);
    await get('?pageSize=51').expect(400);
    await get('?page=0').expect(400);
  });
});
