# 17 — SEO, Structured Data & Analytics

**Goal:** Make the **user_client** storefront server-rendered and search-optimized: per-page metadata via Next 16 `generateMetadata`, dynamic `sitemap.ts` + `robots.ts`, JSON-LD structured data, OpenGraph/Twitter cards (product OG image from Cloudinary), privacy-friendly analytics with cookie consent, and GDPR data export/deletion (backend endpoints surfaced in the account UI). SRD NFR-701–706, CR-005, FR-114.

**Prerequisites:**
- Script `14` — storefront pages exist (home, category `/c/[...slug]`, product `/p/[slug]`, search, account).
- Script `07` — products/categories expose **SEO fields** (`metaTitle`, `metaDescription`, `ogImage`, `canonicalUrl`) over the backend REST API.
- Script `06` — Cloudinary; product images have public ids for OG image derivation.
- Backend REST endpoints for listing published products/categories (for the sitemap) and a `StoreSetting` fetch (store name, logo, socials for `Organization`).
- Env in user_client: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_SITE_URL` (the storefront's own public origin — add to `.env.example`), plus the analytics key(s) below.

> **Architecture reminder (00-BUILD-ORDER):** this script targets **user_client** only. All data comes from the **NestJS backend over REST** via the client `apiClient`; the client never touches the DB. The **GDPR data-export and account-deletion logic lives in the backend** (NestJS) — the storefront only renders the request UI and calls those endpoints.
>
> ⚠️ **Next.js 16 (critical):** the Metadata API, `generateMetadata`, `sitemap.ts`, `robots.ts`, and file-based conventions **may differ from older versions**. Before writing any of this, `npm install` in `user_client`, then read `node_modules/next/dist/docs/` for the **Metadata**, **sitemap/robots**, and **App Router data fetching** guides and follow the version-16 signatures/return types you find there. Do not copy Next 13/14/15 patterns from memory.

---

## Tasks

### 1. [user_client] SSR + per-page metadata (NFR-701, NFR-704)
- Ensure product and category pages are **server-rendered** (Server Components; fetch on the server via `apiClient`).
- **VERIFY the Metadata API against `node_modules/next/dist/docs/` first**, then implement `generateMetadata` per dynamic route (`/p/[slug]`, `/c/[...slug]`) producing: `title`, `description`, `alternates.canonical`, and social tags (Task 4), sourced from the product/category SEO fields (script `07`), with sensible fallbacks.
- Set a root-layout metadata baseline (default title template, site name, description, `metadataBase` = `NEXT_PUBLIC_SITE_URL`).

### 2. [user_client] Sitemap & robots (NFR-702)
- Following the Next 16 docs, add `app/sitemap.ts` that fetches all **published** products + categories from the backend and includes static routes; and `app/robots.ts` (allow crawl, disallow `/account`, `/checkout`, point at the sitemap).
- Both regenerate as the catalog changes (server-evaluated; set an appropriate revalidate/caching strategy per the Next 16 docs).

### 3. [user_client] Structured data — JSON-LD (NFR-703)
- Emit valid JSON-LD via `<script type="application/ld+json">`:
  - **Product** on `/p/[slug]` — name, image(s), description, brand, `offers` (price from **integer cents → decimal string**, `priceCurrency` from store currency, availability from stock), and `aggregateRating` when reviews exist (script `13`).
  - **BreadcrumbList** on product + category pages (category ancestry).
  - **Organization** in the root layout — store name, logo (Cloudinary URL), `sameAs` socials from `StoreSetting`.
- Keep prices/availability consistent with what the page renders.

### 4. [user_client] Social meta — OpenGraph + Twitter (NFR-706)
- OG + Twitter Card tags on all pages (via the metadata objects from Task 1). Product OG image = the product's primary Cloudinary image, transformed to a social-friendly size (e.g. `c_fill,w_1200,h_630`) using the Cloudinary URL/loader.
- Dynamic OG image generation is **optional** (only if a Next 16-supported approach is used — verify in docs); the Cloudinary-derived image is the default.

### 5. [user_client] Privacy-friendly analytics (NFR-705, Should)
- Integrate **Plausible** (cookieless, preferred) or **GA4**. Track pageviews + key conversion events: `add_to_cart`, `begin_checkout`, `purchase`.
- Load the analytics script the Next 16-recommended way (verify script/loading conventions in the docs). Read the domain/key from a `NEXT_PUBLIC_*` env var.
- **Gate any cookie-setting analytics (e.g. GA4) behind consent** (Task 6). Cookieless Plausible may load without consent per its privacy model.

### 6. [user_client] Cookie consent + GDPR surface (CR-005, FR-114)
- Cookie-consent banner (accept/reject non-essential) persisted client-side; analytics that set cookies only initialize after consent. Accessible, keyboard-operable, dismissible.
- In `/account/settings`, surface **Download my data** and **Delete my account** actions that call the **backend** GDPR endpoints (see Task 7). Deletion communicates the **30-day grace period** (FR-114).

### 7. [backend] GDPR data export & deletion endpoints
> This part is NestJS, not the client. The storefront UI in Task 6 only calls these.
- `GET /account/data-export` (JWT-guarded) — assembles the current user's personal data (profile, addresses, orders, reviews, notifications) and returns a downloadable export (JSON, or a streamed archive).
- `DELETE /account` (JWT-guarded) — initiates account deletion with a **30-day grace period**: soft-delete / schedule (status flag + `deletionScheduledAt`), anonymize on expiry, allow cancellation within the window. Retain records required for legal/financial reasons (e.g. order/tax history) in anonymized form.
- Validate with DTOs; write an `AuditLog` entry for export and deletion requests.

### 8. [user_client] Error monitoring (optional)
- Optionally add Sentry (Next.js SDK) for runtime error tracking; scrub PII. Read DSN from `NEXT_PUBLIC_*`. Skip if not desired.

---

## Acceptance criteria
- [ ] Product and category pages are SSR with correct `<title>`, description, and canonical tags produced by a Next 16-verified `generateMetadata`.
- [ ] `/sitemap.xml` and `/robots.txt` are generated dynamically from the backend and include published products + categories.
- [ ] Product pages emit valid **Product** + **BreadcrumbList** JSON-LD (passes Google Rich Results test); the layout emits **Organization**.
- [ ] OpenGraph/Twitter previews render correctly when shared; product OG image comes from Cloudinary at social dimensions.
- [ ] Analytics records pageviews + `add_to_cart` / `begin_checkout` / `purchase`; cookie-setting analytics only fire after consent; the consent banner works and is accessible.
- [ ] Customers can request a **data export** and **account deletion (30-day grace)** from account settings; both call backend NestJS endpoints and write an audit log.
- [ ] No SEO/analytics logic depends on Next API routes as a backend; all data comes from the NestJS REST API.
