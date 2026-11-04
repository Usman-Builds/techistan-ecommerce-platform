import { createHash } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, readSetCookie } from './utils/e2e';
import { resetDb, makeUser } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * #22: each sign-in is its own session. A second device (or two tabs
 * refreshing at once) must not log the first one out; replaying a rotated
 * token revokes only the session it belongs to.
 */
const PASSWORD = 'Str0ng!pass';
const EMAIL = 'two-devices@example.com';

describe('Per-device refresh sessions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Each login gets its own throttle bucket (the strict auth limit is per IP).
  const previousProxySecret = process.env.PROXY_SECRET;
  let ip = 0;

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
    await makeUser(prisma, { email: EMAIL, password: PASSWORD });
  });

  const http = () => request(app.getHttpServer());
  const fromIp = <T extends request.Test>(r: T) =>
    r
      .set('x-proxy-secret', 'test-proxy-secret')
      .set('x-client-ip', `198.51.100.${++ip}`);

  async function signIn() {
    const res = await fromIp(http().post('/auth/login'))
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    return {
      access: (res.body as { accessToken: string }).accessToken,
      refresh: readSetCookie(res, 'refresh_token')!,
    };
  }
  const refresh = (token: string) =>
    fromIp(http().post('/auth/refresh')).set(
      'Cookie',
      `refresh_token=${token}`,
    );
  const me = (access: string) =>
    http().get('/auth/me').set('Authorization', `Bearer ${access}`);
  // JWT iat is second-granular; wait so a rotated token differs from the last.
  const tick = () => new Promise((r) => setTimeout(r, 1100));

  it('keeps the first device signed in after a second device signs in', async () => {
    const laptop = await signIn();
    await tick();
    const phone = await signIn();

    const laptopRefresh = await refresh(laptop.refresh).expect(200);
    await refresh(phone.refresh).expect(200);
    await me(laptop.access).expect(200);
    await me(phone.access).expect(200);
    await me(
      (laptopRefresh.body as { accessToken: string }).accessToken,
    ).expect(200);
  });

  it('lets two tabs refresh the same session at the same moment', async () => {
    const device = await signIn();
    await tick();
    const [a, b] = await Promise.all([
      refresh(device.refresh),
      refresh(device.refresh),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    // And the session is still alive afterwards.
    await tick();
    await refresh(readSetCookie(b, 'refresh_token')!).expect(200);
  });

  it('revokes only the replayed session when a superseded token is reused', async () => {
    const laptop = await signIn();
    const phone = await signIn();
    await tick();
    await refresh(laptop.refresh).expect(200);
    // Age the rotation past the concurrent-refresh grace window.
    await prisma.refreshSession.updateMany({
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });

    await refresh(laptop.refresh).expect(401); // replay → laptop session ends
    await me(laptop.access).expect(401);
    await me(phone.access).expect(200);
    await refresh(phone.refresh).expect(200);
  });

  it('ends every device session on a password reset', async () => {
    const laptop = await signIn();
    const phone = await signIn();
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: EMAIL },
    });
    const raw = 'reset-token-for-session-test';
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await http()
      .post('/auth/reset-password')
      .send({ token: raw, password: 'N3w!password' })
      .expect(200);

    await me(laptop.access).expect(401);
    await me(phone.access).expect(401);
    await refresh(phone.refresh).expect(401);
  });

  it('logging out on one device leaves the other signed in', async () => {
    const laptop = await signIn();
    const phone = await signIn();

    await http()
      .post('/auth/logout')
      .set('Cookie', `refresh_token=${laptop.refresh}`)
      .expect(200);

    await me(laptop.access).expect(401);
    await refresh(laptop.refresh).expect(401);
    await me(phone.access).expect(200);
    await refresh(phone.refresh).expect(200);
  });
});
