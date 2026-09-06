# 19 — Deployment & DevOps

**Goal:** Local Docker environment for data services, a production Dockerfile for the NestJS backend, security headers on all three apps, per-repo CI/CD via GitHub Actions, managed Postgres with pooling, and a documented deploy path — backend on a container/Node host, the two Next.js clients on Vercel or Node hosting. SRD §10, NFR-201/206/210/301–305/402.

**Prerequisites:** All feature scripts complete; tests (`18`) green. **Three separate git repos** (`backend`, `user_client`, `admin_client`), each with its own `.git`, `node_modules`, and CI workflow.

> ⚠️ **Next.js 16:** the two clients run Next 16. Before writing `next.config` header/`output` config, **read `node_modules/next/dist/docs/` in each client** for the correct Next 16 `headers()`, `output` (standalone vs default), and image/remotePatterns config — it may differ from Next 13/14/15 (see `00-BUILD-ORDER.md §7`).
>
> ⚠️ **Per-app boundaries:** the backend owns the DB, Prisma migrations, Stripe webhooks, and secrets; clients only hold `NEXT_PUBLIC_*` values + their own build. Each concern below is labeled by app.

---

## Tasks

### 1. Local infra — Docker Compose (data services)
- Add `docker-compose.yml` (recommended: at `Code/` root, or in the backend repo) running **PostgreSQL 16** with a volume + healthcheck, exposing the `ecom` database and matching the backend `DATABASE_URL`.
- Add **Redis 7** only if a feature actually adopted it (e.g. cart/session/rate-limit cache); otherwise omit — keep infra minimal (`00` favors zero-infra choices, e.g. Postgres FTS over a search server).
- Document startup: `docker compose up -d` for data, then `npm run start:dev` (backend) and `npm run dev` in each client. The apps themselves run on the host in dev (ports 3000/3001/3002).

### 2. Backend — production Dockerfile (NestJS)
- Add a multi-stage `Dockerfile` in `Code/backend`: install deps → `npx prisma generate` → `npm run build` → slim runtime stage running `node dist/main.js` on `PORT` (3000). Include a `.dockerignore`.
- Ensure the Prisma engine/client is present in the runtime image and the container runs `prisma migrate deploy` on start (or as a pre-deploy release step — see Task 6).
- Optionally add the backend to `docker-compose.yml` (behind a `prod`/profile) so the full stack can run in containers locally.

### 3. Security headers — per app (NFR-201, 206, 210)
- **Backend (NestJS)** — add **helmet** (`app.use(helmet(...))` in `main.ts`): HSTS (prod), `X-Content-Type-Options`, `Referrer-Policy`, frameguard, and a sensible CSP for API responses. Keep the existing **CORS with credentials** for the two client origins (`00 §4`). The Stripe webhook route must keep its **raw body** — ensure helmet/body parsing doesn't strip it.
- **Each Next client** — set response headers in `next.config` (**verify the Next 16 `headers()` shape against local docs**): HSTS, `X-Frame-Options`/frame-ancestors, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and a **CSP that allows Cloudinary** (`res.cloudinary.com` images), **Stripe** (`js.stripe.com`, `api.stripe.com`, Stripe frames for Elements), the backend API origin, and the analytics domain (script `17`). Verify Elements + Cloudinary images don't break under the CSP.
- Enforce HTTPS in production (platform default on Vercel/managed hosts); redirect http→https.

### 4. Environments & env-var matrix (SRD §10.1)
- Three tiers: **Development** (local), **Staging** (`develop`), **Production** (`main`), each with its own secrets and its own managed DB (staging seeded).
- Document the **per-app env matrix** (mirrors `01`'s `.env.example` files):
  - **backend:** `NODE_ENV`, `PORT`, `CLIENT_ORIGINS`, `DATABASE_URL` (pooled) + `DIRECT_URL` (migrations), `JWT_SECRET`/`JWT_REFRESH_SECRET` (+ expiries), `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL`, `CLOUDINARY_*`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`/`EMAIL_FROM`, `USER_APP_URL`/`ADMIN_APP_URL`, optional `SENTRY_DSN`.
  - **user_client:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_ANALYTICS_*`, optional `NEXT_PUBLIC_SENTRY_DSN`.
  - **admin_client:** `NEXT_PUBLIC_API_URL` (+ `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` if it uploads), optional `NEXT_PUBLIC_SENTRY_DSN`.
- In prod the clients' `NEXT_PUBLIC_API_URL` points at the deployed backend origin, and the backend's `CLIENT_ORIGINS` + Google callback + `USER_APP_URL`/`ADMIN_APP_URL` point at the deployed client origins. CORS + cookie `SameSite`/`Secure`/domain must be set for cross-origin cookie auth in prod (`00 §4`).

### 5. CI/CD — GitHub Actions **per repo** (SRD §10.2)
Each of the three repos gets its own workflow:
- **backend** (`.github/workflows/ci.yml`): checkout → `npm ci` → lint (ESLint + Prettier check) → typecheck (`tsc --noEmit`) → `prisma generate` → **`npm run test:cov` (Jest unit)** → **integration tests** against a Postgres **service container** (or Testcontainers) with `prisma migrate deploy` → `npm run build` → `npm audit`. Deploy on `main` (see Task 6).
- **user_client** and **admin_client** (each `.github/workflows/ci.yml`): `npm ci` → lint → typecheck → **Vitest (with coverage)** → **`next build`** → `npm audit`. Deploy on `main`.
- **Playwright E2E** (lives in the client repo chosen in `18` Task 6): a job that boots backend + both clients against a seeded test DB and Stripe test mode, then runs the critical-journey suite (`18`) + **Lighthouse CI** (Perf ≥ 90/85) on home + PDP.
- Gate deploys behind green checks; staging on `develop`, production on `main`.

### 6. Deployment targets & migrations
- **Backend** — deploy the container/Node service to **Render, Fly.io, or Railway** (or any Docker host). Run **`npx prisma migrate deploy`** as a release/pre-start step on every deploy (never `migrate dev` in prod). Set all backend env vars in the platform; run one instance minimum with health-check-gated rollout.
- **Clients** — deploy `user_client` and `admin_client` as **two separate Vercel projects** (root dir pointed at each client), **or** as Node servers (`next build && next start -p <port>` / a standalone build). Set `NEXT_PUBLIC_*` per project. Because they're separate repos, each Vercel project tracks its own repo.
- Document that a client deploy is safe without a backend deploy (and vice-versa), as long as the API contract holds.

### 7. Managed data & pooling (SRD §10.3, NFR-402)
- Provision managed **PostgreSQL on Neon or Supabase**. Use Prisma **connection pooling**: `DATABASE_URL` → the pooled endpoint (PgBouncer, `?pgbouncer=true&connection_limit=...`), `DIRECT_URL` → the direct endpoint for `migrate deploy`. Serverless/many-instance backends must use the pooled URL at runtime.
- Provision managed Redis (e.g. Upstash) **only if** Redis was adopted in Task 1.

### 8. Reliability & observability (NFR-301–305)
- Wire the backend **`GET /health`** (from script `01`) to the platform's health check + an uptime monitor.
- Enable the managed provider's **daily automated backups** (30-day retention).
- Verify friendly error pages in each client (`error.tsx` / `not-found.tsx` / `global-error.tsx` per Next 16 conventions — check local docs).
- **Sentry (optional)** — add the Nest SDK on the backend and the Next SDK in each client, DSNs per environment, PII scrubbed. Run `prisma migrate deploy` on backend deploy (Task 6).

### 9. Docs (acceptance §14)
- Finalize each repo's `README`, an architecture diagram (3-app REST topology), a backend **API reference** (Swagger/OpenAPI via `@nestjs/swagger` — not tRPC), a setup guide, and `docs/decisions/` ADRs (e.g. Cloudinary over S3, Postgres FTS over a search server, 3-app split).

---

## Acceptance criteria
- [ ] `docker compose up -d` brings up Postgres (+ Redis if adopted); the backend runs against it locally.
- [ ] The backend production `Dockerfile` builds and runs `node dist/main.js`; `prisma generate` + `migrate deploy` are handled.
- [ ] Security headers set in **NestJS (helmet)** for the API and in **each Next client's config** (verified against Next 16 local docs); CSP allows Cloudinary + Stripe + analytics without breaking Elements or image loading; the Stripe webhook raw body still verifies.
- [ ] Each of the three repos has its own GitHub Actions workflow (lint, typecheck, backend Jest / client Vitest, `next build`, `npm audit`); Playwright E2E + Lighthouse run in the designated client repo.
- [ ] Backend deploys to a container/Node host with `prisma migrate deploy` on release; both clients deploy as separate Vercel projects (or Node hosts) with correct `NEXT_PUBLIC_*` and CORS/cookie config for cross-origin auth.
- [ ] Managed Postgres (Neon/Supabase) with pooled `DATABASE_URL` + direct `DIRECT_URL`; health check, daily backups, and (optional) Sentry configured.
- [ ] Docs complete per SRD §14 (README, architecture, OpenAPI API reference, ADRs).
