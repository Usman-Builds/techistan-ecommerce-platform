# 18 — Testing & Quality

**Goal:** Automated test coverage across all three apps — **Jest** unit + integration on the NestJS backend, **Vitest + Testing Library** component/unit on both Next.js clients, and **Playwright** E2E for the critical journeys that span the backend and both clients running together — plus accessibility, visual-regression, performance, and security checks. Coverage thresholds enforced in CI. SRD §11, NFR-603/604.

**Prerequisites:** Core features (scripts `01`–`17`) implemented. Backend already has Jest configured (default NestJS setup: `jest` + `ts-jest`, `test`/`test:e2e`/`test:cov` scripts, `test/jest-e2e.json`). Both clients have deps installed (script `01`). A reachable Postgres for integration tests (local `ecom` is fine for dev; CI uses a throwaway test DB — see Task 3).

> ⚠️ **Next.js 16:** before writing any client test setup that touches framework internals (Vitest + Next config, `next/navigation` mocks, RSC boundaries, `next/image`), read the relevant guide in each client's `node_modules/next/dist/docs/` first (see `00-BUILD-ORDER.md §7`). Testing conventions may differ from Next 13/14/15.
>
> ⚠️ **Three repos:** backend, `user_client`, and `admin_client` are separate git repos with their own `node_modules` and their own CI. Test tooling is installed and configured **per app**. The Playwright E2E suite is the one cross-cutting exception (Task 6) — decide where it lives (recommended: `user_client` repo, since journeys start on the storefront) and document it.

---

## Tasks

### 1. Backend — unit tests (Jest) for business logic
Jest is already configured in `Code/backend`. Add unit specs (`*.spec.ts`) next to the services they cover, mocking Prisma (and any external SDK) so these stay fast and DB-free. Cover the pure business logic:
- **Money / formatting** — integer-cents helpers: add/subtract, tax and line-total math, no float drift, currency formatting (`00 §9` — money is always integer minor units).
- **Discount engine** — percentage vs fixed, stacking rules, sale-price precedence, min-spend gates, rounding of the discounted total.
- **Order number + status transitions** — order-number generator (format/uniqueness) and the allowed order-status state machine (reject illegal transitions, e.g. `REFUNDED → SHIPPED`).
- **Cart merge** — merging a guest cart into a user cart on login: quantity coalescing, stock clamping, de-duping variants (`09`).
- **Coupon limits** — per-coupon and per-user usage caps, expiry window, min-spend, active/inactive.
Use Nest's `Test.createTestingModule` with provider overrides (mock `PrismaService`) for service-level specs.

### 2. Backend — coverage config & thresholds (Jest)
- Turn on coverage in the Jest config (`package.json` `jest` block or `jest.config.ts`): `collectCoverageFrom` limited to `src/**/*.(t|j)s`, excluding `main.ts`, DTOs, module wiring, and the generated Prisma client.
- Enforce `coverageThreshold`: **80% for business-logic** modules (services in `product`, `order`, `cart`, `coupon`, `payment`, `review`) and **60% global** (NFR-604). CI fails below threshold (`npm run test:cov`).

### 3. Backend — integration tests (Jest + test Postgres)
- Add a `test:integration` run (or reuse `test:e2e` with `test/jest-e2e.json`) that boots the real Nest app via `Test.createTestingModule({ imports: [AppModule] })` + `app.init()` and drives it with `supertest` against a **real Postgres**.
- **Test DB strategy** — pick one and document it:
  - **Testcontainers** (`@testcontainers/postgresql`) spins an ephemeral Postgres per run (preferred for isolation), **or**
  - a **dedicated test database** (`ecom_test`) via a separate `DATABASE_URL` in `.env.test`.
  - Run `prisma migrate deploy` against the test DB in global setup; reset between test files (transaction rollback or `TRUNCATE ... CASCADE`); seed the minimum fixtures each suite needs.
- Cover the controller→service→DB paths, hitting HTTP endpoints (cookies included) with `supertest`:
  - **RBAC** — `RolesGuard` + `@Roles()`: a `CUSTOMER` JWT is `403` on `/admin/*`; `ADMIN`/`SUPER_ADMIN` allowed (`05`, NFR-208). Assert enforcement is server-side, not UI-only.
  - **Register / verify / login** — `/auth/register` creates `CUSTOMER` only, the email-verification token flow, login sets the **httpOnly JWT cookie**, refresh-token rotation (`04`).
  - **Checkout idempotency** — creating an order / confirming a PaymentIntent twice with the same idempotency key produces **one** order, not two (`10`). Simulate the Stripe webhook hitting the Nest endpoint (raw-body signature path).
  - **Review verified-purchase gating** — only a user with a delivered order for that product can post a review (`13`).
  - Spot-check product CRUD, cart add/merge, and coupon apply end-to-end for regression coverage.

### 4. Clients — unit + component (Vitest + Testing Library) in **each** client
For **both** `user_client` and `admin_client` (configure independently in each repo):
- Install and configure **Vitest + @testing-library/react + @testing-library/jest-dom + jsdom** (or `happy-dom`). Add a `vitest.config.ts` with the React plugin and the `@/*` / `@shared/*` path aliases mirrored from `tsconfig.json`. Add a `test` script.
- **Verify the Next 16 setup against `node_modules/next/dist/docs/`** before wiring — confirm how to mock `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`), `next/image`, and Server vs Client Component boundaries under Vitest.
- Cover, per client:
  - **Client-side utils & schemas** — `cn()`, price/format display, Zod form schemas (valid/invalid cases), any client-side cart/store (Zustand) reducers.
  - **Key components in isolation** — `user_client`: product card, cart line item, coupon input, quantity stepper, checkout form validation. `admin_client`: product form, order status control, data-table filters.
  - Mock the `apiClient`/TanStack Query layer (MSW or a stub) — component tests must not hit the real backend.
- Enforce Vitest `coverage` thresholds: **80% business-logic** utils/schemas, **60% overall** per client (NFR-604); fail the client build below threshold.

### 5. Clients — accessibility & visual regression
- **Accessibility (`@axe-core/playwright`)** — run axe against major storefront pages (home, category/PLP, PDP, cart, checkout, login) and major admin pages (login, dashboard, product form, orders). Add explicit **keyboard-navigation** tests for the checkout and auth forms (tab order, focus trap in modals, visible focus). Enforce WCAG 2.1 AA, contrast ≥ 4.5:1 (`00 §9`).
- **Visual regression** — Playwright screenshot snapshots of key pages across **mobile + desktop** viewports; commit baselines, diff on CI, allow intentional updates via `--update-snapshots`.

### 6. Cross-app — Playwright E2E for critical journeys (SRD §11)
> **E2E spans all three apps.** These journeys require the **backend (`:3000`) + `user_client` (`:3001`) + `admin_client` (`:3002`) all running together** against a seeded test DB and **Stripe test mode**. Use Playwright's `webServer` config to start the three servers (or a `docker compose`/script that boots them), and seed a known admin + catalog before the run. Document the one-command local invocation and where the suite lives.
- **Guest purchase** — browse → add to cart → checkout as guest → pay with **Stripe test card** (`4242 4242 4242 4242`) → order confirmation.
- **Logged-in purchase** — login → purchase → order appears in account order history.
- **Register → verify → purchase** — self sign-up (`CUSTOMER`), consume the email-verification link, then complete a first purchase.
- **Cart** — add / update quantity / remove / apply coupon (and see totals recompute).
- **Admin round-trip** — in `admin_client`: create a product → assert it **appears on the storefront** (`user_client`) → place an order as a customer → back in admin, **process and refund** the order → assert the customer-side status reflects it.
- **Search → filter → sort → open** — query the storefront, apply a facet, change sort, open a product (`08`).
- **Edge cases** — out-of-stock at checkout, expired/invalid coupon, and **payment-failure recovery** (Stripe decline test card → retry succeeds).

### 7. Performance & security in CI
- **Lighthouse CI** on key storefront pages (home + PDP) against a running `user_client`: budget **Performance ≥ 90**, launch floor **≥ 85** (NFR). Wire as a CI step per client where relevant.
- **`npm audit`** (and/or Dependabot) in **each** repo's CI; fail on high/critical. After script `19` sets security headers (helmet on the API, Next config on the clients), verify no critical/high header findings (e.g. Mozilla Observatory against a deployed/staged origin).

---

## Acceptance criteria
- [ ] Backend `npm run test` (unit) passes; the money, discount-engine, order-number/status, cart-merge, and coupon-limit specs exist and pass.
- [ ] Backend `npm run test:cov` meets thresholds (80% business logic / 60% global); CI fails below.
- [ ] Backend integration suite runs against a real test Postgres (Testcontainers or `ecom_test`) and covers RBAC, register/verify/login, checkout idempotency, and review verified-purchase gating.
- [ ] Both clients have Vitest + Testing Library configured (verified against Next 16 local docs) with component + unit specs passing and coverage thresholds enforced.
- [ ] axe checks pass on major storefront + admin pages; keyboard flows work on checkout and auth forms.
- [ ] Playwright E2E boots backend + both clients together against a seeded DB and Stripe test mode; all critical journeys (incl. the admin→storefront round-trip and payment-failure recovery) pass locally and in CI.
- [ ] Visual-regression snapshots diff clean on mobile + desktop.
- [ ] Lighthouse CI meets the performance budget on home + PDP; no critical/high `npm audit` findings in any repo.
