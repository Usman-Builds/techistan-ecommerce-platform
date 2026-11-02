# Techistan — Full-Stack E-Commerce Platform

**Project knowledge sheet.** A reference for CVs, portfolios and interviews: what
the system is, how it is built, and which parts are worth talking about.

|                   |                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **Type**          | Full-stack e-commerce platform (storefront + admin console + REST API)                                     |
| **Role**          | Sole developer — architecture, database, backend, both frontends, deployment                                |
| **Status**        | Deployed and running end to end (test-mode payments)                                                       |
| **Storefront**    | https://techistan.vercel.app                                                                               |
| **Admin console** | https://techistanadmin.vercel.app                                                                          |
| **API**           | NestJS service on Render, PostgreSQL on Neon                                                               |
| **Stack**         | TypeScript, NestJS 11, Prisma 6, PostgreSQL, Next.js 16, React 19, Tailwind, Stripe, Cloudinary, Resend, Docker |

---

## At a glance

| Metric            | Value                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| TypeScript source | ~55,600 lines across 490 files                                             |
| Backend           | 26 feature modules, 35 controllers, 159 HTTP endpoints                     |
| Database          | 39 Prisma models, 16 enums, 15 migrations (980-line schema)                |
| Storefront        | 19 routes (App Router)                                                     |
| Admin console     | 25 routes                                                                  |
| Automated tests   | 213 unit tests (32 suites), 10 API integration specs, 7 Playwright E2E specs |
| Deployment        | 3 services: Docker API on Render, two Next.js apps on Vercel, Neon Postgres |

---

## Architecture

Three deployable applications around one API. The two frontends are separate
Next.js apps rather than one app with role branching, so the customer bundle
never ships admin code and each can be deployed, scaled and secured on its own.

```
Browser ──► Next.js storefront ─┐                  ┌─► Neon PostgreSQL (Prisma)
           (Vercel)             │                  │
                                ├─► NestJS API ────┼─► Stripe (payments, webhooks)
Browser ──► Next.js admin ──────┘   (Render,       ├─► Cloudinary (media)
           (Vercel)                  Docker)       └─► Resend (transactional email)
```

**Request path.** Browsers never call the API host directly. Each Next app
proxies `/api/*` to the API through a `next.config.ts` rewrite, which keeps the
JWT cookies first-party — the fix for a real production bug, described below.

**Auth.** Stateless JWT access and refresh tokens in `httpOnly`, `Secure`,
`SameSite=Lax` cookies. Next.js `proxy.ts` (Next 16's renamed middleware) does a
cheap presence check at the edge; the authoritative identity and role check is
server-side against `GET /auth/me`, and NestJS guards are the real enforcement
point. Roles: `CUSTOMER`, `ADMIN`, `SUPER_ADMIN`.

---

## Tech stack

| Layer            | Choices                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| **API**          | NestJS 11, TypeScript, Passport JWT, class-validator DTOs, Joi-validated config, Throttler rate limiting, `@nestjs/schedule` cron |
| **Data**         | PostgreSQL (Neon serverless), Prisma 6, SQL migrations, `pg_trgm` fuzzy search                                       |
| **Frontends**    | Next.js 16 (App Router, RSC), React 19, TanStack Query, Zustand, React Hook Form + Zod, Tailwind CSS, Framer Motion, next-themes |
| **Integrations** | Stripe (Payment Element + webhooks), Cloudinary (signed direct uploads), Resend + React Email, PDFKit invoices        |
| **Testing**      | Jest, Supertest, Vitest, Testing Library, Playwright, Lighthouse CI                                                  |
| **Infra**        | Multi-stage Docker (Debian slim, non-root), Render blueprint (`render.yaml`), Vercel, GitHub                         |

---

## Feature set

**Storefront**

- Catalog with categories, brands, tags, variants, and per-variant stock
- Full-text and fuzzy search (trigram similarity), faceted filtering, sorting
- Guest and signed-in carts, with the guest cart merged on login
- Wishlist, recently viewed, deals page, dynamic homepage
- Stripe checkout, order confirmation, order history, PDF invoices
- Return requests, reviews with images and helpfulness votes
- Email verification, password reset, notification centre, GDPR account deletion

**Admin console**

- Dashboard with revenue and order analytics
- Products, variants, categories, tags, media library, bulk inventory editing
- Orders: status workflow, shipment events, internal notes, refunds, returns
- Coupons, automatic discounts, scheduled sales
- Review moderation queue, customers, audit log, store settings
- Merchandising: homepage sections, hero slides, navigation builder
- CSV exports for orders, customers and products

**Platform**

- Role-based access control, request rate limiting, audit logging
- Signed-cookie guest sessions; idempotent order submission
- Cron jobs: hourly abandoned-cart recovery, nightly account anonymisation
- SEO: metadata API, `sitemap.ts`, `robots.ts`, JSON-LD; cookieless analytics
- One brand token file generates the CSS variables for both apps; full dark mode

---

## Engineering highlights

Problems worth discussing in an interview, all of them solved in this codebase.

**Exactly-once payment confirmation, with a fallback.** A Stripe webhook confirms
the order, decrements stock, finalises coupon redemption and clears the cart in
one transaction, deduplicated by event id. Because a webhook can be missing,
misconfigured, or delivered to a sleeping free-tier instance, the order endpoint
also reconciles directly against the Stripe API while the confirmation page
polls. Both paths share one guard — a conditional status update that only one
transaction can win — so stock is never decremented twice.

**Cross-site cookie failure in production.** Login worked, then every following
request returned 401. Cause: the API and the frontends were on sibling
`*.onrender.com` hosts, which are different _sites_, so `SameSite=Lax` cookies
were dropped. Fixed by proxying `/api/*` from each Next app to the API, making
the cookies first-party — no backend change, and server components and middleware
can now read the session too.

**Postgres-backed search instead of a search service.** Trigram similarity and
ranked text matching behind a `SEARCH_DRIVER` switch, so search tolerates typos
without adding Elasticsearch to the deployment.

**Promotions engine.** Coupons and automatic discounts share a scope model
(whole cart, category, product) and are computed against the _eligible_
subtotal, with redemption limits enforced transactionally at payment time.

**Order lifecycle as a state machine.** Allowed transitions are declared in one
place and enforced server-side, so illegal jumps (such as REFUNDED → SHIPPED)
are impossible rather than merely hidden in the UI.

**Media handling without touching the server.** The browser uploads to Cloudinary
directly with a signed payload; the API only stores metadata, and a custom
`next/image` loader emits Cloudinary transformation URLs, so no image bytes ever
pass through the API.

**Deployment realities.** A multi-stage Docker image that strips the Prisma CLI
out of the runtime layer, region-pinned to match the database (cross-region added
~230 ms to every query), with a documented runbook covering migrations, webhook
configuration and free-tier spin-down.

---

## Testing and quality

| Suite                                  | Scope                                                      | Count                 |
| -------------------------------------- | ---------------------------------------------------------- | --------------------- |
| Backend unit (Jest)                    | pricing, coupons, cart merge, order state machine, payments | 108 tests / 14 suites |
| Backend integration (Supertest)        | auth, catalog, checkout and admin flows against the API     | 10 specs              |
| Storefront unit (Vitest + Testing Library) | components, hooks, formatting                           | 47 tests / 8 files    |
| Admin unit (Vitest + Testing Library)  | tables, forms, permissions                                  | 58 tests / 10 files   |
| E2E (Playwright)                       | browse → cart → checkout → order journeys                   | 7 specs               |
| Performance (Lighthouse CI)            | storefront budgets                                          | configured            |

TypeScript runs strict across all three apps, with ESLint and Prettier enforced.

---

## Deployment and operations

- **API:** Docker image built from a Render blueprint, health check at `/health`,
  auto-deploy on commit, secrets held in the dashboard and never in the repo.
- **Frontends:** Vercel, with the API URL baked in at build time.
- **Database:** Neon serverless Postgres; pooled connection for the app, direct
  connection for migrations (advisory locks cannot cross a transaction pooler).
- **Seeding:** idempotent scripts for the admin account, catalog and a full demo
  dataset.
- **Runbooks:** `Code/backend/DEPLOY-RENDER.md` covers deploy, migrations, Stripe
  webhooks and a troubleshooting table.

---

## CV bullet points

Ready to paste, trim to taste:

- Built and deployed a full-stack e-commerce platform (~55k lines of TypeScript):
  a NestJS/PostgreSQL API with 159 endpoints across 26 modules, plus separate
  Next.js 16 storefront and admin applications.
- Designed a 39-model Prisma schema covering catalog, variants, carts, orders,
  payments, returns, promotions and reviews, evolved through 15 migrations.
- Integrated Stripe payments with idempotent, exactly-once webhook processing and
  an API-side reconciliation fallback, so no order can double-decrement stock or
  be stranded when a webhook is lost.
- Diagnosed and fixed a production authentication failure caused by cross-site
  `SameSite` cookie rules, by proxying API calls through each Next.js app.
- Implemented JWT cookie auth with role-based access control, rate limiting and
  an audit log, plus GDPR account deletion with scheduled anonymisation.
- Delivered typo-tolerant product search on PostgreSQL trigram similarity,
  avoiding a separate search service.
- Wrote 213 unit tests plus API integration and Playwright end-to-end coverage,
  and set up Lighthouse CI budgets.
- Containerised the API in a multi-stage Docker image and deployed across Render,
  Vercel and Neon with an operational runbook.

---

## Honest limitations

Worth knowing before an interviewer finds them.

- Runs on free tiers: the API spins down after 15 minutes idle and takes about a
  minute to wake, so the first request after a quiet period is slow.
- Stripe is in test mode; no live payments have been processed.
- The rate limiter is in-memory, which is correct for one instance but would need
  a shared store behind more than one.
- Migrations are run manually from a developer machine, because Render's
  pre-deploy hook requires a paid plan.
- No CI pipeline yet: tests run locally rather than on push.
