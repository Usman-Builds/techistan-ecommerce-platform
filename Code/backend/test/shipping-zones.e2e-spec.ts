import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '@prisma/client';
import { createTestApp } from './utils/e2e';
import { makeUser, resetDb } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';
import { PricingService } from '../src/modules/order/pricing.service';

/**
 * Shipping zones (#34): pricing reads an ARRAY of
 * `{ label, rateCents, countries?, freeOverCents? }`. The admin settings API
 * must accept exactly that shape (it used to demand an object), reject
 * malformed zones with a 400, and a saved zone must drive the shipping quote.
 */
const PASSWORD = 'Str0ng!pass';

describe('Shipping zones via PATCH /admin/settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  // Log in once: /auth/login is rate-limited per client.
  beforeAll(async () => {
    await resetDb(prisma);
    await makeUser(prisma, {
      email: 'admin@example.com',
      password: PASSWORD,
      role: Role.ADMIN,
    });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    adminToken = res.body.accessToken;
  });

  const patch = (body: object) =>
    request(app.getHttpServer())
      .patch('/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const quoteFor = (country: string, subtotalCents: number) =>
    app.get(PricingService).quote({
      address: { country } as never,
      subtotalCents,
      discountCents: 0,
      freeShipping: false,
    });

  it('saves an array of zones and uses it for the shipping quote', async () => {
    await patch({
      shippingZones: [
        {
          label: 'US',
          countries: ['US'],
          rateCents: 900,
          freeOverCents: 10000,
        },
        { label: 'Rest of world', rateCents: 2500 },
      ],
    }).expect(200);

    const us = await quoteFor('US', 4000);
    expect(us.shippingCents).toBe(900);
    expect(us.shippingLabel).toBe('US');

    const usFree = await quoteFor('US', 12000);
    expect(usFree.shippingCents).toBe(0);

    const fr = await quoteFor('FR', 4000);
    expect(fr.shippingCents).toBe(2500);
    expect(fr.shippingLabel).toBe('Rest of world');
  });

  it.each([
    [
      'an object instead of an array',
      { DEFAULT: { flat: 500, freeOver: 5000 } },
    ],
    ['a zone without rateCents', [{ label: 'US' }]],
    ['a negative rate', [{ label: 'US', rateCents: -1 }]],
    [
      'a non-ISO country code',
      [{ label: 'US', rateCents: 900, countries: ['USA'] }],
    ],
    ['an unknown field', [{ label: 'US', rateCents: 900, flat: 500 }]],
  ])('rejects %s with 400', async (_, shippingZones) => {
    await patch({ shippingZones }).expect(400);
  });

  it('accepts null to clear the zones', async () => {
    await patch({ shippingZones: null }).expect(200);
  });
});
