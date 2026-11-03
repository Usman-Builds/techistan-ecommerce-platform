import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '@prisma/client';
import { createTestApp } from './utils/e2e';
import { makeUser, resetDb } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Route-table RBAC sweep (#45). `rbac.e2e-spec.ts` proves the guard on one
 * route; this walks every route Nest actually registered so a single missing
 * `@AdminOnly()` (or a new unreviewed controller, like the old `/users` CRUD)
 * fails the suite:
 *
 *  1. every admin-only route: 401 anonymous, 403 with a CUSTOMER token;
 *  2. every customer route that needs a session: 401 anonymous;
 *  3. every other route must be listed below as reviewed, so adding a route
 *     outside `/admin/*` forces a deliberate decision about its access level.
 *
 * Guards run before pipes, so dummy path params and empty bodies are enough:
 * a request that gets past the guard fails later with 400/404 instead.
 */
const PASSWORD = 'Str0ng!pass';

type Access = 'public' | 'session' | 'secret';

/** Admin-only routes that do not live under `/admin/*`. */
const ADMIN_OUTSIDE_PREFIX = [
  'GET /media',
  'POST /media',
  'DELETE /media/:publicId',
  'POST /media/upload-signature',
  'POST /payments/:orderId/refund',
];

/**
 * Every non-admin route and its intended access level. `session` = requires a
 * signed-in user (any role). `public` routes may still accept an optional
 * session or a guest cart cookie. `secret` = authenticated by a shared secret
 * or signature instead of a user session.
 */
const REVIEWED: Record<string, Access> = {
  'GET /': 'public',
  'GET /health': 'public',
  // auth
  'POST /auth/register': 'public',
  'POST /auth/login': 'public',
  'POST /auth/admin/login': 'public',
  'POST /auth/refresh': 'public', // authenticated by the refresh cookie
  'POST /auth/logout': 'public',
  'POST /auth/forgot-password': 'public',
  'POST /auth/reset-password': 'public',
  'POST /auth/verify-email': 'public',
  'POST /auth/resend-verification': 'public',
  'GET /auth/me': 'session',
  // account
  'DELETE /account': 'session',
  'POST /account/cancel-deletion': 'session',
  'GET /account/data-export': 'session',
  'GET /addresses': 'session',
  'POST /addresses': 'session',
  'DELETE /addresses/:id': 'session',
  'GET /notifications': 'session',
  'GET /notifications/unread-count': 'session',
  'PATCH /notifications/:id/read': 'session',
  'PATCH /notifications/read-all': 'session',
  'GET /wishlist': 'session',
  'POST /wishlist/items': 'session',
  'DELETE /wishlist/items/:productId': 'session',
  'POST /wishlist/items/:productId/move-to-cart': 'session',
  // orders (guest orders are reachable by id, so detail routes are public)
  'GET /orders': 'session',
  'POST /orders': 'public',
  'GET /orders/:id': 'public',
  'GET /orders/:id/invoice': 'public',
  'POST /orders/:id/cancel': 'session',
  'POST /orders/:id/return': 'public',
  // cart (guest carts via cookie)
  'GET /cart': 'public',
  'DELETE /cart': 'public',
  'POST /cart/items': 'public',
  'PATCH /cart/items/:itemId': 'public',
  'DELETE /cart/items/:itemId': 'public',
  'POST /cart/coupon': 'public',
  'DELETE /cart/coupon': 'public',
  'POST /cart/estimate-shipping': 'public',
  // catalogue & storefront
  'GET /products': 'public',
  'GET /products/sitemap': 'public',
  'GET /products/:slug': 'public',
  'GET /categories/tree': 'public',
  'GET /categories/sitemap': 'public',
  'GET /categories/:slug': 'public',
  'GET /tags': 'public',
  'GET /search': 'public',
  'GET /search/suggest': 'public',
  'GET /search/facets': 'public',
  'GET /settings': 'public',
  'GET /storefront/homepage': 'public',
  'GET /storefront/navigation': 'public',
  'GET /storefront/brands': 'public',
  'GET /storefront/testimonials': 'public',
  'GET /promotions/offers': 'public',
  'GET /promotions/automatic-discounts': 'public',
  'GET /recently-viewed': 'public',
  'POST /recently-viewed': 'public',
  'GET /reviews': 'public',
  'POST /reviews': 'session',
  'POST /reviews/:id/helpful': 'session',
  // machine-to-machine
  'POST /payments/webhook': 'secret',
  'POST /cron/abandoned-carts': 'secret',
  'POST /cron/anonymize-accounts': 'secret',
};

interface RouteEntry {
  method: string;
  path: string;
  key: string;
}

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

function listRoutes(app: INestApplication): RouteEntry[] {
  const instance = app.getHttpAdapter().getInstance() as {
    router?: { stack: RouterLayer[] };
    _router?: { stack: RouterLayer[] };
  };
  const stack = (instance.router ?? instance._router)?.stack ?? [];
  const routes: RouteEntry[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const m of Object.keys(layer.route.methods)) {
      const method = m.toUpperCase();
      routes.push({
        method,
        path: layer.route.path,
        key: `${method} ${layer.route.path}`,
      });
    }
  }
  return routes;
}

const isAdmin = (r: RouteEntry) =>
  r.path.startsWith('/admin/') || ADMIN_OUTSIDE_PREFIX.includes(r.key);

describe('RBAC route-table sweep (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let customerToken: string;
  let routes: RouteEntry[];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    await makeUser(prisma, {
      email: 'cust@example.com',
      password: PASSWORD,
      role: Role.CUSTOMER,
    });
    // Log in once: /auth/login is rate-limited per client.
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'cust@example.com', password: PASSWORD })
      .expect(200);
    customerToken = res.body.accessToken;
    routes = listRoutes(app);
  });
  afterAll(async () => {
    await app.close();
  });

  const call = (r: RouteEntry, token?: string) => {
    const path = r.path.replace(/:[A-Za-z]+/g, 'sweep-id');
    const agent = request(app.getHttpServer()) as unknown as Record<
      string,
      (p: string) => request.Test
    >;
    const req = agent[r.method.toLowerCase()](path);
    if (token) void req.set('Authorization', `Bearer ${token}`);
    return req.send({});
  };

  it('finds the route table (sanity check)', () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.filter(isAdmin).length).toBeGreaterThan(50);
  });

  it('every admin-only route rejects anonymous (401) and CUSTOMER (403) callers', async () => {
    const failures: string[] = [];
    for (const r of routes.filter(isAdmin)) {
      const anon = (await call(r)).status;
      const cust = (await call(r, customerToken)).status;
      if (anon !== 401 || cust !== 403) {
        failures.push(`${r.key}: anonymous ${anon}, customer ${cust}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('every session route rejects anonymous callers with 401', async () => {
    const failures: string[] = [];
    for (const r of routes.filter((x) => REVIEWED[x.key] === 'session')) {
      const status = (await call(r)).status;
      if (status !== 401) failures.push(`${r.key}: ${status}`);
    }
    expect(failures).toEqual([]);
  });

  it('every non-admin route has a reviewed access level', () => {
    // A new route outside /admin/* must be added to REVIEWED (or made
    // admin-only) after deciding who may call it.
    const unreviewed = routes
      .filter((r) => !isAdmin(r) && !(r.key in REVIEWED))
      .map((r) => r.key);
    expect(unreviewed).toEqual([]);
  });

  it('lists no reviewed route that no longer exists', () => {
    const keys = new Set(routes.map((r) => r.key));
    const stale = Object.keys(REVIEWED).filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
  });

  it('exposes no legacy /users routes', () => {
    expect(routes.filter((r) => r.path.startsWith('/users'))).toEqual([]);
  });
});
