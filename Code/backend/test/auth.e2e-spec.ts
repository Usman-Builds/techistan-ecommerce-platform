import { createHash } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '@prisma/client';
import { createTestApp, readSetCookie } from './utils/e2e';
import { resetDb } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Auth flow (script 04): register creates a CUSTOMER pending verification, the
 * email-verification token flow, login sets the httpOnly JWT cookie, and refresh
 * rotates the refresh token (old one is invalidated). Real DB, real bcrypt/JWT.
 */
const PASSWORD = 'Str0ng!pass';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('Auth (e2e)', () => {
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

  const register = (email: string) =>
    request(app.getHttpServer()).post('/auth/register').send({
      firstName: 'New',
      lastName: 'Shopper',
      email,
      password: PASSWORD,
    });

  it('registers a CUSTOMER pending email verification and sets auth cookies', async () => {
    const res = await register('reg@example.com').expect(201);
    expect(res.body.user).toMatchObject({ email: 'reg@example.com', role: 'CUSTOMER' });
    expect(res.body.user.password).toBeUndefined(); // never leak the hash

    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
    expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);

    const row = await prisma.user.findUnique({ where: { email: 'reg@example.com' } });
    expect(row?.role).toBe(Role.CUSTOMER);
    expect(row?.emailVerified).toBeNull(); // must verify before login
  });

  it('rejects login until the email is verified, then succeeds after verification', async () => {
    await register('verify@example.com').expect(201);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'verify@example.com' },
    });

    // Unverified LOCAL login is forbidden (FR-101).
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'verify@example.com', password: PASSWORD })
      .expect(403);

    // Drive the real verification endpoint with a token we mint the same way the
    // service does (sha256(raw) stored; raw only ever leaves via email).
    const raw = 'verify-token-abc';
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: raw })
      .expect(200);

    const verified = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(verified.emailVerified).not.toBeNull();

    // Now login works and sets an httpOnly access cookie.
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'verify@example.com', password: PASSWORD })
      .expect(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const access = cookies.find((c) => c.startsWith('access_token='));
    expect(access).toContain('HttpOnly');
  });

  it('rotates the refresh token and rejects the superseded one', async () => {
    const reg = await register('rotate@example.com').expect(201);
    const firstRefresh = readSetCookie(reg, 'refresh_token');
    expect(firstRefresh).toBeTruthy();

    // JWT `iat`/`exp` are second-granular, so wait >1s to guarantee the rotated
    // token differs from the first (otherwise they'd be byte-identical and
    // "rotation" would be unobservable within the same clock second).
    await new Promise((r) => setTimeout(r, 1100));

    // Rotate: presenting the current refresh cookie yields a fresh pair.
    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${firstRefresh}`)
      .expect(200);
    const secondRefresh = readSetCookie(rotated, 'refresh_token');
    expect(secondRefresh).toBeTruthy();
    expect(secondRefresh).not.toBe(firstRefresh);

    // The superseded token is no longer accepted (rotation invalidates it).
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${firstRefresh}`)
      .expect(401);
  });

  it('never creates an ADMIN through public registration', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Sneaky',
        lastName: 'User',
        email: 'sneaky@example.com',
        password: PASSWORD,
        role: 'ADMIN', // extra field — stripped by whitelist, ignored by service
      })
      .expect(400); // forbidNonWhitelisted rejects the unknown property
  });
});
