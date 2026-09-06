# 18 — Testing & Quality

**Goal:** Automated test coverage — unit, component, integration, and E2E — plus accessibility, performance, and security checks. SRD §11, NFR-603/604.

**Prerequisites:** Core features (scripts `01`–`17`) implemented.

---

## Tasks

### 1. Unit + component (Vitest — 80% biz logic / 70% components)
- Configure Vitest + Testing Library + jsdom. Cover: money/format utils, discount engine, search query builder, order-number + status-transition logic, cart merge logic, Zod schemas, and key UI components in isolation.

### 2. Integration (Vitest + test DB)
- Spin a test Postgres (Docker/Testcontainers or a dedicated test DB). Test tRPC routers against a real DB for: register/verify/login, product CRUD + RBAC, cart add/merge, checkout `createOrder` idempotency, coupon limits, review verified-purchase gating.

### 3. E2E (Playwright) — critical journeys (SRD §11)
- Complete purchase (guest + logged-in) with Stripe test card.
- Register → verify email → first purchase.
- Cart: add / update qty / remove / apply coupon.
- Admin: create product → appears on storefront → receive order → process/refund.
- Search: query → filter → sort → open product.
- Edge cases: out-of-stock, expired coupon, payment failure recovery.

### 4. Accessibility
- `@axe-core/playwright` checks on major pages; keyboard-navigation tests for checkout + forms.

### 5. Visual regression
- Playwright screenshot snapshots of key pages across mobile/desktop viewports.

### 6. Performance & security in CI
- **Lighthouse CI** on key pages (budget: Performance ≥ 90 / launch ≥ 85).
- `npm audit` / Dependabot; verify security headers (CSP, HSTS, X-Frame-Options, etc. — set them in script `19`) pass Mozilla Observatory.

### 7. Coverage reporting
- Enforce thresholds (80% business logic, 60% overall — NFR-604) in Vitest config; fail CI below threshold.

---

## Acceptance criteria
- [ ] `pnpm test` (unit+integration) passes with coverage ≥ targets.
- [ ] All critical E2E journeys pass locally and in CI (against staging/test env).
- [ ] axe checks pass on major pages; keyboard flows work.
- [ ] Lighthouse CI meets the performance budget on home + PDP.
- [ ] No critical/high dependency vulnerabilities.
