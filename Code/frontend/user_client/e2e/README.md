# Cross-app E2E (Playwright)

These journeys span **all three apps** — backend (`:3000`), storefront (`:3001`),
and admin (`:3002`) — against a seeded test DB and **Stripe test mode**. The suite
lives in `user_client` because every journey starts on the storefront (SRD §11,
script 18 Task 6).

## One-command local run

```bash
# From Code/frontend/user_client
npm run e2e:install     # one-time: download the Playwright browsers
npm run e2e             # boots all 3 servers (playwright.config webServer) + runs
```

`playwright.config.ts` `webServer` starts the backend (`start:prod`), storefront,
and admin, waiting for each to be reachable. To run against servers you already
have up: `E2E_NO_SERVER=1 npm run e2e`.

## Prerequisites

1. **Test database** — a dedicated `ecom_e2e` (separate from `ecom_test` used by
   the backend integration suite so the two never race):
   ```bash
   cd ../../backend
   DATABASE_URL="postgresql://postgres:<pw>@localhost/ecom_e2e?schema=public" npx prisma migrate deploy
   ```
   Override the URL with `E2E_DATABASE_URL` (see `playwright.config.ts`).

2. **Seed** the catalog + admin into that DB (global-setup asserts a product
   exists and fails fast otherwise):
   ```bash
   DATABASE_URL="…/ecom_e2e…" npm run seed        # demo catalog
   DATABASE_URL="…/ecom_e2e…" npm run seed:admin   # preseeded SUPER_ADMIN
   ```
   Admin creds come from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (or the `E2E_ADMIN_*`
   overrides in `e2e/fixtures.ts`).

3. **Stripe test mode** on the backend — `STRIPE_SECRET_KEY=sk_test_…` and
   `STRIPE_WEBHOOK_SECRET=whsec_…`. The order flips to CONFIRMED only when the
   webhook lands, so forward events locally:
   ```bash
   stripe listen --forward-to localhost:3000/payment/webhook
   ```
   The purchase specs use test cards `4242…4242` (success) and `4000…0002`
   (decline → retry).

## What's covered

| Spec | Journey |
|---|---|
| `smoke.spec.ts` | SSR renders, robots/sitemap served, Product/Breadcrumb JSON-LD (script 17) |
| `shopping.spec.ts` | search → filter → sort → open; cart add/update/remove/coupon |
| `purchase.spec.ts` | guest purchase (Stripe test card); payment-failure → retry |
| `account.spec.ts` | register (CUSTOMER); purchase → appears in order history |
| `admin-roundtrip.spec.ts` | admin creates product → appears on storefront; order → process → refund → customer status reflects it |
| `a11y.spec.ts` | axe (WCAG 2.1 AA) on major storefront + admin pages; keyboard focus |
| `visual.spec.ts` | screenshot baselines, mobile + desktop |

## Visual regression

Baselines live in `e2e/__snapshots__/`. Diff on CI; update intentional changes:

```bash
npm run e2e:update
```

## Notes / hardening

- Selectors prefer accessible roles + visible text. Where the storefront markup
  is ambiguous, add `data-testid` hooks and tighten the locators.
- In CI, reuse an authenticated session via Playwright `storageState` instead of
  re-registering per test, and consume the email-verification token via the
  backend rather than a real inbox.
