import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '@prisma/client';
import { createTestApp } from './utils/e2e';
import { makeUser, resetDb } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * #51: `from` / `to` on the analytics, audit-log and orders-export endpoints
 * were only `@IsString()`, so `?from=yesterday` became `Invalid Date` and a 500
 * (and a truncated CSV for the export). They must be validated as ISO-8601
 * dates and rejected with a 400.
 */
const PASSWORD = 'Str0ng!pass';

const ROUTES = [
  '/admin/analytics/order-stats',
  '/admin/analytics/top-products',
  '/admin/analytics/conversion',
  '/admin/audit-logs',
  '/admin/exports/orders.csv',
];

describe('Date range filters (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    await makeUser(prisma, {
      email: 'admin@example.com',
      password: PASSWORD,
      role: Role.ADMIN,
    });
    // Log in once: /auth/login is rate-limited per client.
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    token = res.body.accessToken;
  });
  afterAll(async () => {
    await app.close();
  });

  const get = (url: string) =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token}`);

  describe.each(ROUTES)('%s', (route) => {
    it.each([['from=not-a-date'], ['to=yesterday'], ['from=2026-13-45']])(
      'rejects ?%s with 400',
      async (qs) => {
        const res = await get(`${route}?${qs}`);
        expect(res.status).toBe(400);
      },
    );

    it('accepts ISO dates and full ISO timestamps', async () => {
      await get(`${route}?from=2026-01-01&to=2026-01-31`).expect(200);
      await get(
        `${route}?from=2026-01-01T00:00:00.000Z&to=2026-01-31T23:59:59.999Z`,
      ).expect(200);
    });
  });
});
