import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './utils/e2e';
import { resetDb, makeUser } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * #20: an access token is only as good as the session behind it. Banning a
 * customer, logging out, or resetting the password must revoke an access token
 * that was already issued, not leave it working for its 24-hour lifetime.
 */
const PASSWORD = 'Str0ng!pass';

describe('Access token revocation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Each login gets its own throttle bucket (the strict auth limit is per
  // client IP), so this suite's logins don't trip each other's 429.
  const previousProxySecret = process.env.PROXY_SECRET;
  let loginCount = 0;

  beforeAll(async () => {
    process.env.PROXY_SECRET = 'test-proxy-secret';
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
    if (previousProxySecret === undefined) delete process.env.PROXY_SECRET;
    else process.env.PROXY_SECRET = previousProxySecret;
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-proxy-secret', 'test-proxy-secret')
      .set('x-client-ip', `203.0.113.${++loginCount}`)
      .send({ email, password: PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }
  const me = (token: string) =>
    request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

  it('rejects the token of a customer who has been banned', async () => {
    await makeUser(prisma, { email: 'c@example.com', password: PASSWORD });
    await makeUser(prisma, {
      email: 'admin@example.com',
      password: PASSWORD,
      role: Role.ADMIN,
    });
    const token = await login('c@example.com');
    const adminToken = await login('admin@example.com');
    await me(token).expect(200);

    const customer = await prisma.user.findUniqueOrThrow({
      where: { email: 'c@example.com' },
    });
    await request(app.getHttpServer())
      .patch(`/admin/customers/${customer.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'BANNED' })
      .expect(200);

    await me(token).expect(401);
  });

  it('rejects the token after logout', async () => {
    await makeUser(prisma, { email: 'c@example.com', password: PASSWORD });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-proxy-secret', 'test-proxy-secret')
      .set('x-client-ip', `203.0.113.${++loginCount}`)
      .send({ email: 'c@example.com', password: PASSWORD })
      .expect(200);
    const token = (res.body as { accessToken: string }).accessToken;
    const cookies = res.headers['set-cookie'] as unknown as string[];
    // The browser sends its auth cookies with the logout request.
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookies.map((c) => c.split(';')[0]).join('; '))
      .expect((r) => expect(r.status).toBeLessThan(300));
    await me(token).expect(401);
  });

  it('rejects the token after a password reset (session revoked)', async () => {
    const user = await makeUser(prisma, {
      email: 'c@example.com',
      password: PASSWORD,
    });
    const token = await login('c@example.com');
    // What resetPassword does to the session: the stored refresh token is cleared.
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: null },
    });
    await me(token).expect(401);
  });

  it('rejects the token of a deleted user', async () => {
    const user = await makeUser(prisma, {
      email: 'c@example.com',
      password: PASSWORD,
    });
    const token = await login('c@example.com');
    await prisma.user.delete({ where: { id: user.id } });
    await me(token).expect(401);
  });

  it('uses the current role, not the one baked into the token', async () => {
    const user = await makeUser(prisma, {
      email: 'staff@example.com',
      password: PASSWORD,
      role: Role.ADMIN,
    });
    const token = await login('staff@example.com');
    await request(app.getHttpServer())
      .get('/admin/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await prisma.user.update({
      where: { id: user.id },
      data: { role: Role.CUSTOMER },
    });
    await request(app.getHttpServer())
      .get('/admin/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('keeps an active session working', async () => {
    await makeUser(prisma, { email: 'c@example.com', password: PASSWORD });
    const token = await login('c@example.com');
    await me(token).expect(200);
    await me(token).expect(200);
  });
});
