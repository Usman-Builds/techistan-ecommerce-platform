import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role, UserStatus } from '@prisma/client';
import { createTestApp } from './utils/e2e';
import { makeUser, resetDb } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * #26: PATCH /admin/customers/:id/status only toggles ACTIVE <-> BANNED.
 * PENDING_DELETION and DELETED belong to the GDPR flow (deletion date,
 * anonymisation), so this endpoint must refuse them instead of writing a state
 * the rest of the system never processes.
 */
const PASSWORD = 'Str0ng!pass';

describe('Customer status toggle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let customerId: number;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    await makeUser(prisma, {
      email: 'admin@example.com',
      password: PASSWORD,
      role: Role.ADMIN,
    });
    const customer = await makeUser(prisma, {
      email: 'cust@example.com',
      password: PASSWORD,
    });
    customerId = customer.id;
    // Log in once: /auth/login is rate-limited per client.
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    adminToken = res.body.accessToken;
  });
  afterAll(async () => {
    await app.close();
  });

  const setStatus = (status: string) =>
    request(app.getHttpServer())
      .patch(`/admin/customers/${customerId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status });

  const current = async () =>
    (await prisma.user.findUniqueOrThrow({ where: { id: customerId } })).status;

  it('bans and reactivates a customer', async () => {
    await setStatus(UserStatus.BANNED).expect(200);
    expect(await current()).toBe(UserStatus.BANNED);
    await setStatus(UserStatus.ACTIVE).expect(200);
    expect(await current()).toBe(UserStatus.ACTIVE);
  });

  it.each([UserStatus.PENDING_DELETION, UserStatus.DELETED, 'NOPE'])(
    'rejects %s with 400 and leaves the account unchanged',
    async (status) => {
      await setStatus(status).expect(400);
      expect(await current()).toBe(UserStatus.ACTIVE);
    },
  );
});
