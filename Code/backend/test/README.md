# Backend tests

Two layers, run independently.

## Unit tests (fast, DB-free)

```bash
npm run test        # all *.spec.ts under src/
npm run test:cov    # + coverage gate (see below)
```

Unit specs sit next to the code they cover (`src/**/*.spec.ts`) and mock
`PrismaService`, so they never touch a database. They cover the pure business
logic: money/cents formatting, the discount + sale-pricing engine, the
order-number generator and status state machine, cart-merge coalescing/clamping,
and coupon usage-limit validation.

### Coverage gate (Task 2, NFR-604)

`test:cov` enforces thresholds via the `jest.coverageThreshold` block in
`package.json`. The gate is scoped (`collectCoverageFrom`) to the pure
business-logic units — `money.util`, `sale-pricing`, `order-status`,
`pricing.service` — held at **80% statements / lines / functions**. These files
are the money-critical logic; CI fails if coverage regresses below the floor.
Controller→service→DB coverage of the Prisma-coupled services is the job of the
integration layer below, not the unit gate.

## Integration tests (real Postgres)

```bash
npm run test:integration   # test/**/*.e2e-spec.ts against ecom_test
```

These boot the full `AppModule` (the same way `main.ts` does — raw body,
cookie-parser, global `ValidationPipe`) and drive it with `supertest` over a
**real Postgres**. They cover: RBAC on `/admin/*` (NFR-208), the
register→verify→login flow + refresh-token rotation, checkout idempotency
(FR-406), and review verified-purchase gating (FR-701).

### Test DB strategy — dedicated `ecom_test`

A dedicated database keeps integration runs isolated from dev data. One-time
setup (idempotent):

```bash
# 1. Point Prisma at the test DB and apply migrations (creates it if absent).
#    migrate deploy — NOT migrate dev — so the hand-authored FTS/trigram GIN
#    indexes (script 08) survive.
DATABASE_URL="postgresql://postgres:<pw>@localhost/ecom_test?schema=public" \
  npx prisma migrate deploy
```

`.env.test` (git-ignored) holds `NODE_ENV=test` and the `ecom_test`
`DATABASE_URL`; `test/setup-e2e.ts` loads it and refuses to run unless the URL
points at `ecom_test` (a guard against ever truncating the dev DB). Each suite
truncates all tables (`RESTART IDENTITY CASCADE`, preserving
`_prisma_migrations`) in `beforeEach`, so specs are order-independent.

> CI alternative: swap the dedicated DB for **Testcontainers**
> (`@testcontainers/postgresql`) — spin an ephemeral Postgres per run, point
> `DATABASE_URL` at it, `prisma migrate deploy`, then run `test:integration`.
> The specs are container/DB-agnostic; only the `DATABASE_URL` source changes.

Stripe is never contacted: the idempotency spec stubs `PaymentService`, and email
sends are best-effort (they log and continue when no `RESEND_API_KEY` is set).
