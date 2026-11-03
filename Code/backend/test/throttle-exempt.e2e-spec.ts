import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/e2e';

/**
 * #30: the global throttle (100 req/min per client) must not apply to the
 * Stripe webhook (authenticated by its signature) or the cron routes
 * (authenticated by CRON_SECRET). A burst of Stripe deliveries from one IP
 * would otherwise get 429s and leave paid orders PENDING until Stripe retries.
 */
const BURST = 110; // just over the 100/min global limit

describe('Throttle exemptions (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  async function statuses(send: () => request.Test): Promise<number[]> {
    const out: number[] = [];
    for (let i = 0; i < BURST; i++) out.push((await send()).status);
    return out;
  }

  it('still rate-limits an ordinary route (control)', async () => {
    const s = await statuses(() => request(app.getHttpServer()).get('/'));
    expect(s).toContain(429);
  });

  it('never answers the Stripe webhook with 429', async () => {
    // No signature → 400 from the handler; the point is it is never a 429.
    const s = await statuses(() =>
      request(app.getHttpServer())
        .post('/payments/webhook')
        .set('Content-Type', 'application/json')
        .send('{}'),
    );
    expect(s).not.toContain(429);
    expect(new Set(s)).toEqual(new Set([400]));
  });

  it('never answers a cron route with 429', async () => {
    // Wrong secret → 401 (or 503 if CRON_SECRET is unset); never 429.
    const s = await statuses(() =>
      request(app.getHttpServer())
        .post('/cron/abandoned-carts')
        .set('x-cron-secret', 'wrong'),
    );
    expect(s).not.toContain(429);
  });
});
