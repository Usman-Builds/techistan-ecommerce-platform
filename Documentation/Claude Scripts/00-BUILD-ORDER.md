# ShopForge — Master Build Order & Conventions

> **How to use these files:** Each numbered `.md` file in this folder is a self-contained execution script. Run them **in order**, one at a time. Open a file, point Claude Code at it, let it complete, verify the "Acceptance Criteria" at the bottom, then move to the next. Do **not** skip ahead — later scripts assume the outputs of earlier ones.
>
> These scripts were rewritten (v2) to match the **actual** repository architecture. The first draft (a single Next.js app with tRPC/Auth.js/pnpm) was archived to `_archive-singleapp-v1/` and does **not** apply.

---

## 1. What we are building

**ShopForge** — a production-grade ecommerce platform (per `Documentation/Planning/ShopForge_SRD_v1.0.docx`) built as **three separate applications**:

```
Code/
  backend/                 # NestJS REST API (package name: PrismoraAI) — the ONLY backend
  frontend/
    user_client/           # Next.js 16 — customer storefront
    admin_client/          # Next.js 16 — admin panel
  shared/                  # (added in script 01) shared brand theme + types consumed by both clients
```

- **One backend** (NestJS) owns all data, business logic, auth, and integrations (Prisma/Postgres, Cloudinary, Stripe, Resend).
- **Two independent Next.js clients** call the backend over **REST** (JWT auth). They are separate git repos with their own `node_modules`.
- This is a **REST + separate-SPA** architecture — **not** tRPC, **not** Next.js API routes as the primary backend, **not** Auth.js/NextAuth.

---

## 2. Current code state (starting point — already exists)

| App | Framework | Package mgr | Status |
|---|---|---|---|
| `Code/backend` | **NestJS 11**, Prisma 6 | **npm** | Runs & builds. Has `auth` (local + Google + JWT), `user` (CRUD), `prisma` modules. Prisma schema = **`User` only**. |
| `Code/frontend/user_client` | **Next.js 16.2.11**, React 19.2, Tailwind v4, React Compiler | **npm** | Untouched create-next-app scaffold. `node_modules` **not installed** yet. |
| `Code/frontend/admin_client` | same as user_client | **npm** | Untouched scaffold. `node_modules` **not installed** yet. |

We **extend** this code; we do not replace it. The existing `User` model and auth flow are the foundation — scripts add a `role` field, ecommerce entities, and the missing surfaces rather than rewriting from scratch.

---

## 3. Locked technical decisions

| Concern | Decision | Notes |
|---|---|---|
| Backend | **NestJS 11 (REST)** | already scaffolded; controllers + services + DTOs |
| ORM / DB | **Prisma 6 + PostgreSQL** | DB name **`ecom`** (existing local DB); Neon/Supabase compatible in prod |
| Server validation | **class-validator + class-transformer** (DTOs) | global `ValidationPipe` (whitelist + transform) already on |
| Config | **@nestjs/config + Joi** | extend `src/config/validation.ts` for every new env var |
| Frontend | **Next.js 16 (App Router) + React 19** | ⚠️ see §7 — consult local Next 16 docs before writing client code |
| Client fetching | **TanStack Query + a typed `apiClient` (fetch wrapper)** | one `apiClient` per client under `src/lib/api` |
| Client forms/validation | **react-hook-form + Zod** | Zod optional but preferred for form schemas |
| Styling | **Tailwind CSS v4** (+ Shadcn/UI where useful) | CSS-variables mode for theming |
| Animation | **Framer Motion** | ≤300ms, respect `prefers-reduced-motion` |
| Auth | **Passport JWT** (extend existing) | see §4 |
| **File storage** | **Cloudinary** | ⚠️ replaces SRD's S3/R2; signed uploads from backend |
| Email | **Resend + React Email** | branded templates from the theme system |
| Payments | **Stripe** (test mode) | PayPal deferred to v1.1; webhooks handled in NestJS |
| Search | **PostgreSQL full-text search** behind an interface | zero-infra (CR-001); swappable for Meilisearch later |
| Client cart state | **Zustand** (guest) + backend cart (logged-in) | merged on login |
| Theme / dark mode | **`next-themes` + shared brand tokens** (`Code/shared`) | see script `02` |
| Package manager | **npm** | pnpm unavailable here (corepack EPERM); everything uses npm |
| Testing | **Jest** (backend, already configured) + **Vitest**/**Playwright** (clients) | |
| Lint/format | **ESLint + Prettier** (per app) | |

### Ports (avoid the triple-3000 collision)
- `backend` → **3000** (already set)
- `user_client` → **3001** (`next dev -p 3001`)
- `admin_client` → **3002** (`next dev -p 3002`)

### Assumptions (adjust in the relevant script if wrong)
- **Storefront "Email Auth"** = email + password with email verification, **plus** Google OAuth.
- **Admin login** = email + password **only** (no OAuth, no self-registration); accounts **preseeded** via seed + env vars.
- Primary currency **USD**, configurable in store settings. Single-tenant, single store.

---

## 4. Authentication model (important)

One NestJS auth system, one `User` table, **role-gated**. JWT issued by the backend.

| Surface (client) | Methods | Registration | Roles |
|---|---|---|---|
| **user_client** (storefront) | Email + password (verified), **Google** | Self sign-up | `CUSTOMER` |
| **admin_client** (admin) | Email + password **only** | ❌ none — **preseeded** | `ADMIN`, `SUPER_ADMIN` |

- `User` gets a **`role` enum**: `CUSTOMER` (default) · `ADMIN` · `SUPER_ADMIN`.
- **Token transport:** backend sets the JWT in an **httpOnly, SameSite, Secure-in-prod cookie**; CORS is configured with credentials for both client origins. (A bearer-header fallback may exist for tooling.)
- **RBAC** enforced in the backend via a `RolesGuard` + `@Roles()` decorator on controllers/handlers — **not** just in client UI (NFR-208).
- Admin endpoints live under an `/admin/*` prefix (or are role-guarded); `admin_client` never calls customer-only registration.
- `/auth/register` creates `CUSTOMER` only. Admins are created by `seedAdmin()` reading `ADMIN_EMAIL`/`ADMIN_PASSWORD` → `SUPER_ADMIN`.
- Details in scripts `04-auth-users.md` (extend customer auth) and `05-auth-admin.md` (roles, RBAC, preseed).

---

## 5. Theme system (must stay centralized)

The user requirement: **"change the theme by changing only a few things"** — across **both** clients.

- All brand tokens (colors, fonts, radius) live in **one shared file**: `Code/shared/theme/brand.ts`.
- Both clients consume it (via a shared workspace/transpiled package or a generated `brand.css`), so editing `brand.ts` re-themes storefront **and** admin.
- Generates CSS variables for **light + dark**, consumed by Tailwind. `next-themes` drives the toggle in each client.
- To re-brand: edit `brand.ts` only. See script `02-theme-system.md`.

---

## 6. Folder structure (target)

```
Code/
  backend/
    src/
      modules/
        auth/  user/  product/  category/  cart/  order/  payment/
        coupon/  review/  media/  search/  notification/  admin/  store-setting/
      common/            # guards, decorators (@Roles), interceptors, filters, pipes
      config/            # configuration.ts, validation.ts (Joi)
      prisma/            # PrismaModule + PrismaService
    prisma/
      schema.prisma      # all entities (script 03)
      seed.ts            # admin preseed + demo data
  frontend/
    user_client/src/
      app/               # storefront routes
      components/{ui,storefront,shared}/
      lib/{api,auth,utils}/
      theme/             # ThemeProvider + re-exports shared brand
    admin_client/src/
      app/               # admin routes (dashboard, catalog, orders, ...)
      components/{ui,admin,shared}/
      lib/{api,auth,utils}/
      theme/
  shared/
    theme/brand.ts       # single source of brand tokens
    types/               # shared DTO/response types (optional, kept in sync with backend)
```

---

## 7. ⚠️ Next.js 16 caveat (read before touching either client)

Both clients run **Next.js 16.2.11**, and their `AGENTS.md` warns: *"This version has breaking changes — APIs, conventions, and file structure may differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."*

**Every client-touching script must:** (1) ensure deps are installed (`npm install`), then (2) consult `node_modules/next/dist/docs/` for the relevant API (routing, metadata, fonts, image, server actions, config) **before** writing code, and heed deprecation notices. Do not assume Next 13/14/15 conventions.

---

## 8. Execution sequence

| # | Script | Track | Delivers |
|---|---|---|---|
| 00 | `00-BUILD-ORDER.md` | — | This file: architecture, conventions, decisions |
| 01 | `01-project-setup.md` | all | Install client deps, ports, shared workspace, tooling, env files, health check |
| 02 | `02-theme-system.md` | shared + clients | Centralized brand tokens, light/dark, ThemeProvider + toggle in both clients |
| 03 | `03-database-schema.md` | backend | Full Prisma schema (all entities), migrations, seed scaffold, `role` on User |
| 04 | `04-auth-users.md` | backend + user_client | Extend auth: email verification, password reset, refresh tokens; storefront auth UI |
| 05 | `05-auth-admin.md` | backend + admin_client | `role` enum, RolesGuard/@Roles, preseeded admin, admin login UI |
| 06 | `06-cloudinary-media.md` | backend + clients | Cloudinary signed uploads, media module, uploader components |
| 07 | `07-product-catalog.md` | backend + admin_client | Products, variants, categories, tags — modules + admin CRUD |
| 08 | `08-search-filtering.md` | backend + user_client | FTS behind interface, facets, sorting, autocomplete |
| 09 | `09-cart-wishlist.md` | backend + user_client | Cart (guest+user, merge on login), wishlist |
| 10 | `10-checkout-payments.md` | backend + user_client | Multi-step checkout, Stripe intents, tax/shipping, webhooks |
| 11 | `11-orders.md` | backend + both clients | Order lifecycle, order numbers, tracking, returns |
| 12 | `12-promotions-discounts.md` | backend + admin_client | Coupons, automatic discounts, sale pricing |
| 13 | `13-reviews-ratings.md` | backend + both clients | Verified reviews, moderation, aggregates |
| 14 | `14-storefront-ui.md` | user_client | Home, category, PDP, cart, account pages (polished UI) |
| 15 | `15-admin-dashboard.md` | admin_client | Dashboard, analytics, inventory, settings, audit log |
| 16 | `16-notifications-email.md` | backend + both clients | Transactional + admin emails, in-app notifications |
| 17 | `17-seo-analytics.md` | user_client | SSR metadata, sitemap/robots, JSON-LD, OpenGraph, analytics |
| 18 | `18-testing.md` | all | Jest (backend), Vitest + Playwright (clients), critical E2E flows |
| 19 | `19-deployment.md` | all | Docker Compose, CI/CD, env matrix, deploy (Render/Fly/Vercel), security headers |

---

## 9. Conventions every script follows

- **Never** store raw card data (NFR-207); Stripe.js/Elements + PaymentIntents only.
- All backend mutations go through **DTOs validated by class-validator**; validate server-side always. RBAC via `RolesGuard`.
- Money stored as **integer minor units** (cents) to avoid float errors.
- Every new external service reads keys from the backend `.env` (never hardcoded) and is documented in `.env.example`. Client-exposed values use `NEXT_PUBLIC_*` in each client.
- Backend is the **single source of truth**; clients never talk to the DB directly.
- Prefer **Server Components** in the clients; use Client Components only when needed. Consult Next 16 docs (§7).
- Keep components accessible (WCAG 2.1 AA), keyboard-navigable, contrast ≥ 4.5:1.
- Conventional Commits for any git commits (each app has its own repo).

## 10. Acceptance criteria for the whole build
See `Documentation/Planning/ShopForge_SRD_v1.0.docx` §14. Each script has its own local acceptance checklist.
