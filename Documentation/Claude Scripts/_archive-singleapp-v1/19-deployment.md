# 19 — Deployment & DevOps

**Goal:** Local Docker environment, security headers, CI/CD via GitHub Actions, and production deployment on Vercel with managed data services. SRD §10, NFR-201/206/210/301–305.

**Prerequisites:** All feature scripts complete; tests (`18`) green.

---

## Tasks

### 1. Local infra (Docker Compose)
- `docker-compose.yml`: PostgreSQL 16 + Redis 7 (+ Meilisearch optional if adopted). `.env` wiring; documented `pnpm dev` startup.
- Optional production Dockerfile for self-hosting (CR-006).

### 2. Security headers & policies (NFR-201, 206, 210)
- `next.config` / middleware headers: HSTS, CSP (allow Cloudinary, Stripe, analytics domains), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Verify no CSP breakage on Stripe/Cloudinary.
- HTTPS/TLS enforced (Vercel default); redirect http→https.

### 3. Environments (SRD §10.1)
- **Development** (local), **Staging** (`develop` branch), **Production** (`main`). Separate env var sets; seeded staging DB.

### 4. CI/CD (GitHub Actions — SRD §10.2)
Pipeline on every push:
- Lint (ESLint + Prettier check)
- Typecheck (`tsc --noEmit`)
- Unit + integration (Vitest)
- Build verification (`next build`)
- E2E (Playwright) against a preview/staging deploy
- Lighthouse CI + `npm audit`
- Deploy: staging on `develop`, production on `main` (after staging approval). Zero-downtime (Vercel rolling — NFR-303).

### 5. Managed services (SRD §10.3)
- PostgreSQL: **Neon** or **Supabase**; Redis: **Upstash**. Prisma with connection pooling (PgBouncer/Prisma Data Proxy — NFR-402).
- Configure Vercel Cron for abandoned-cart + any scheduled jobs.

### 6. Reliability (NFR-301–305)
- `/api/health` (from script `01`) wired to uptime monitoring.
- Daily automated DB backups, 30-day retention (managed provider setting).
- Friendly error pages on all routes (verify `error.tsx`/`not-found.tsx`).

### 7. Observability
- Sentry (if adopted) DSNs per environment; Vercel Analytics.
- Run DB migrations on deploy (`prisma migrate deploy`).

### 8. Docs (acceptance §14)
- Finalize README, architecture diagram, API reference (tRPC panel/OpenAPI), setup guide, and `docs/decisions/` ADRs.

---

## Acceptance criteria
- [ ] `docker compose up` brings up Postgres/Redis; app runs against it locally.
- [ ] Security headers pass Mozilla Observatory (A/A+); CSP does not break Stripe/Cloudinary.
- [ ] GitHub Actions pipeline runs all checks and deploys staging (`develop`) + production (`main`).
- [ ] Production runs on Vercel with managed Postgres/Redis, pooled connections, and cron jobs.
- [ ] `prisma migrate deploy` runs on deploy; health check + backups configured.
- [ ] Docs complete per SRD §14.
