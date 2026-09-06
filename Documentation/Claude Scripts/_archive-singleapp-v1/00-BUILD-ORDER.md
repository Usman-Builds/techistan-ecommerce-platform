# ShopForge — Master Build Order & Conventions

> **How to use these files:** Each numbered `.md` file in this folder is a self-contained execution script. Run them **in order**, one at a time. Open a file, paste/point Claude Code at it, let it complete, verify the "Acceptance Criteria" at the bottom, then move to the next. Do **not** skip ahead — later scripts assume the outputs of earlier ones.

---

## 1. What we are building

**ShopForge** — a production-grade ecommerce platform (per `Documentation/Planning/ShopForge_SRD_v1.0.docx`) consisting of:

- **Storefront** — customer-facing store (`app/(storefront)`)
- **Admin Panel** — back-office to manage the store (`app/(admin)`)

Both live in **one Next.js application** using route groups, sharing the same database, theme system, and component library.

---

## 2. Locked technical decisions

These override or clarify the SRD where the user gave explicit instructions.

| Concern | Decision | Notes |
|---|---|---|
| Framework | **Next.js 15 (App Router) + React 19** | SSR/SSG storefront + admin |
| Language | **TypeScript, strict mode** | NFR-601 |
| Styling | **Tailwind CSS v4 + Shadcn/UI (Radix)** | SRD §8.2 |
| Animation | **Framer Motion** | ≤300ms, respect `prefers-reduced-motion` |
| Database | **PostgreSQL + Prisma ORM** | Neon/Supabase compatible |
| API | **tRPC** (type-safe internal API) | SRD §7 |
| Validation | **Zod** (shared client + server schemas) | NFR-203 |
| Auth | **Auth.js (NextAuth v5)** | see §3 below |
| **File storage** | **Cloudinary** | ⚠️ replaces SRD's S3/R2 |
| Email | **Resend + React Email** | branded, responsive templates |
| Payments | **Stripe** (test mode) | PayPal deferred to v1.1 |
| Search | **PostgreSQL full-text search** behind an abstraction | zero-infra (CR-001); swappable for Meilisearch later |
| Client cart state | **Zustand** (guest) + DB (logged-in) | merged on login |
| Theme / dark mode | **`next-themes` + centralized token file** | see script `02` |
| Package manager | **pnpm** | |
| Testing | **Vitest** (unit/integration) + **Playwright** (E2E) | |
| Lint/format | **ESLint + Prettier + Husky + lint-staged** | NFR-602 |

### Assumptions (adjust in the relevant script if wrong)
- **Storefront "Email Auth"** = email + password with email verification link, **plus** Google OAuth.
- **Admin login** = email + password **only** (no OAuth, no self-registration); accounts are **preseeded** via a seed script + env vars.
- Primary currency **USD**, configurable in store settings.
- Single-tenant, single store.

---

## 3. Authentication model (important)

Two separate auth surfaces, one Auth.js instance, role-gated:

| Surface | Methods | Registration | Roles |
|---|---|---|---|
| **Storefront** | Email + password (verified), **Google** | Self sign-up | `CUSTOMER` |
| **Admin** | Email + password **only** | ❌ none — **preseeded** | `ADMIN`, `SUPER_ADMIN` |

- Admin routes (`/admin/**`) are protected by middleware requiring `ADMIN`/`SUPER_ADMIN`.
- RBAC is enforced at the **API/tRPC layer**, not just the UI (NFR-208).
- Details in scripts `04-auth-storefront.md` and `05-auth-admin.md`.

---

## 4. Theme system (must stay centralized)

The user requirement: **"change the theme by changing only a few things."**

- All brand tokens (colors, fonts, radius) live in **one file**: `src/theme/brand.ts`.
- That file generates CSS variables for **light + dark**, consumed by Tailwind + Shadcn.
- To re-brand: edit `brand.ts` only. See script `02-theme-system.md`.

---

## 5. Folder structure (target)

```
src/
  app/
    (storefront)/        # customer site
    (admin)/admin/       # admin panel
    api/                 # route handlers (webhooks, health, auth)
  server/                # tRPC routers, services, db
    routers/
    services/
    db.ts                # Prisma client singleton
  lib/                   # shared utils (auth, cloudinary, stripe, email, zod schemas)
  components/
    ui/                  # Shadcn primitives
    storefront/
    admin/
    shared/
  theme/                 # brand.ts, ThemeProvider, tokens
  styles/                # globals.css
prisma/
  schema.prisma
  seed.ts
```

---

## 6. Execution sequence

| # | Script | Delivers |
|---|---|---|
| 01 | `01-project-setup.md` | Next.js app, TS strict, Tailwind, Shadcn, ESLint/Prettier/Husky, folder scaffold, env template |
| 02 | `02-theme-system.md` | Centralized brand tokens, light/dark, ThemeProvider, toggle |
| 03 | `03-database-schema.md` | Full Prisma schema, migrations, Prisma client, seed scaffold |
| 04 | `04-auth-storefront.md` | Auth.js: email/password + verification + Google (CUSTOMER) |
| 05 | `05-auth-admin.md` | Preseeded admin login, RBAC, admin middleware |
| 06 | `06-cloudinary-media.md` | Cloudinary upload, signed uploads, media library helpers |
| 07 | `07-product-catalog.md` | Products, variants, categories, tags — models + tRPC + admin CRUD |
| 08 | `08-search-filtering.md` | Full-text search, faceted filters, sorting, autocomplete |
| 09 | `09-cart-wishlist.md` | Cart (guest+user, merge on login), wishlist |
| 10 | `10-checkout-payments.md` | Multi-step checkout, Stripe intents, tax/shipping, webhooks |
| 11 | `11-orders.md` | Order lifecycle, order numbers, tracking, returns |
| 12 | `12-promotions-discounts.md` | Coupons, automatic discounts, sale pricing |
| 13 | `13-reviews-ratings.md` | Verified reviews, moderation, aggregates |
| 14 | `14-storefront-ui.md` | Home, category, PDP, cart, account pages (polished UI) |
| 15 | `15-admin-dashboard.md` | Dashboard, analytics, inventory, settings, audit log |
| 16 | `16-notifications-email.md` | Transactional + admin emails, in-app notifications |
| 17 | `17-seo-analytics.md` | SSR, sitemap/robots, JSON-LD, OpenGraph, analytics |
| 18 | `18-testing.md` | Vitest, Playwright, coverage, critical E2E flows |
| 19 | `19-deployment.md` | Docker Compose, CI/CD (GitHub Actions), Vercel, envs |

---

## 7. Conventions every script follows

- **Never** store raw card data (NFR-207); Stripe.js only.
- All mutations go through **tRPC + Zod**; validate server-side always.
- Money stored as **integer minor units** (cents) to avoid float errors.
- Every new external service reads keys from `.env` (never hardcoded) and is documented in `.env.example`.
- Prefer **Server Components**; use Client Components only when needed.
- Keep components accessible (WCAG 2.1 AA), keyboard-navigable, contrast ≥ 4.5:1.
- Conventional Commits for any git commits.

## 8. Acceptance criteria for the whole build
See `Documentation/Planning/ShopForge_SRD_v1.0.docx` §14. Each script has its own local acceptance checklist.
