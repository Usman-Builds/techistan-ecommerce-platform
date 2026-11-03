import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/e2e';
import { makeUser, resetDb } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Email addresses are case-insensitive (#21). "Ada@Example.com" and
 * "ada@example.com" are the same mailbox, so they must be the same account:
 * login / forgot-password / resend work in any case, and a differently-cased
 * duplicate can't be registered. Rows stored mixed-case before this fix must
 * keep working.
 */
const PASSWORD = 'Str0ng!pass';

describe('Email case-insensitivity (e2e)', () => {
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
      firstName: 'Ada',
      lastName: 'Lovelace',
      email,
      password: PASSWORD,
    });
  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });

  it('stores a registered email in lowercase', async () => {
    await register('  Ada@Example.COM ').expect(201);
    const row = await prisma.user.findFirst({
      where: { email: { contains: 'example.com', mode: 'insensitive' } },
    });
    expect(row?.email).toBe('ada@example.com');
  });

  it('rejects a differently-cased duplicate registration with 409', async () => {
    await register('ada@example.com').expect(201);
    await register('ADA@example.com').expect(409);
    expect(await prisma.user.count()).toBe(1);
  });

  it('logs in regardless of the case typed', async () => {
    await makeUser(prisma, { email: 'ada@example.com', password: PASSWORD });
    await login('Ada@Example.com').expect(200);
  });

  it('still logs in a legacy mixed-case row with any casing', async () => {
    await makeUser(prisma, { email: 'Legacy@Example.com', password: PASSWORD });
    await login('legacy@example.com').expect(200);
    await login('Legacy@Example.com').expect(200);
  });

  it('issues a reset token when forgot-password uses a different case', async () => {
    const user = await makeUser(prisma, {
      email: 'ada@example.com',
      password: PASSWORD,
    });
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'ADA@EXAMPLE.COM' })
      .expect((res) => expect(res.status).toBeLessThan(300));
    expect(
      await prisma.passwordResetToken.count({ where: { userId: user.id } }),
    ).toBe(1);
  });

  it('resends verification when the case differs', async () => {
    const user = await makeUser(prisma, {
      email: 'ada@example.com',
      password: PASSWORD,
      verified: false,
    });
    await request(app.getHttpServer())
      .post('/auth/resend-verification')
      .send({ email: 'Ada@Example.com' })
      .expect((res) => expect(res.status).toBeLessThan(300));
    expect(
      await prisma.emailVerificationToken.count({ where: { userId: user.id } }),
    ).toBe(1);
  });
});
