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
    await makeUser(prisma, { email: 'cust@example.com', password: PASSWORD, role: Role.CUSTOMER });
    await makeUser(prisma, { email: 'admin@example.com', password: PASSWORD, role: Role.ADMIN });

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

  it('blocks a CUSTOMER from the admin login endpoint (403)', () => {
    return request(app.getHttpServer())
      .post('/auth/admin/login')
      .send({ email: 'cust@example.com', password: PASSWORD })
      .expect(403);
  });
});
