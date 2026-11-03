import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '@prisma/client';
import { createTestApp } from './utils/e2e';
import { resetDb, makeUser } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Server-side RBAC (script 05, NFR-208). `@AdminOnly()` on /admin/* must reject a
 * CUSTOMER regardless of what the client renders. We prove enforcement is at the
 * API, not the UI: 401 without a token, 403 with a customer token, 200 for admin.
 */
const PASSWORD = 'Str0ng!pass';

describe('RBAC on /admin/* (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  let customerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await resetDb(prisma);
    await makeUser(prisma, {
      email: 'cust@example.com',
      password: PASSWORD,
      role: Role.CUSTOMER,
    });
    await makeUser(prisma, {
      email: 'admin@example.com',
      password: PASSWORD,
      role: Role.ADMIN,
    });

    const cust = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'cust@example.com', password: PASSWORD })
      .expect(200);
    customerToken = cust.body.accessToken;

    const admin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    adminToken = admin.body.accessToken;
  });

  it('rejects an anonymous request with 401', () => {
    return request(app.getHttpServer()).get('/admin/audit-logs').expect(401);
  });

  it('forbids a CUSTOMER token with 403', () => {
    return request(app.getHttpServer())
      .get('/admin/audit-logs')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('allows an ADMIN token with 200', () => {
    return request(app.getHttpServer())
      .get('/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  // #23: the leftover scaffold `/users` CRUD let any signed-in customer list
  // every user (with password hashes), rewrite an admin's email and delete
  // accounts. No client uses it, so none of its routes may be reachable.
  describe('legacy /users routes are not exposed', () => {
    const routes: Array<[string, (s: request.Agent) => request.Test]> = [
      ['GET /users', (s) => s.get('/users')],
      ['GET /users/:id', (s) => s.get('/users/1')],
      ['POST /users', (s) => s.post('/users').send({})],
      ['PUT /users/:id', (s) => s.put('/users/1').send({ email: 'x@y.z' })],
      ['DELETE /users/:id', (s) => s.delete('/users/1')],
    ];

    it.each(routes)('%s returns 404 for a CUSTOMER token', async (_, call) => {
      const res = await call(request.agent(app.getHttpServer())).set(
        'Authorization',
        `Bearer ${customerToken}`,
      );
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(/password|refreshToken/);
    });

    it('leaves the admin account untouched after a customer attempt', async () => {
      const before = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@example.com' },
      });
      await request(app.getHttpServer())
        .put(`/users/${before.id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ email: 'attacker@example.com' });
      const after = await prisma.user.findUnique({ where: { id: before.id } });
      expect(after?.email).toBe('admin@example.com');
    });
  });

  it('blocks a CUSTOMER from the admin login endpoint (403)', () => {
    return request(app.getHttpServer())
      .post('/auth/admin/login')
      .send({ email: 'cust@example.com', password: PASSWORD })
      .expect(403);
  });
});
