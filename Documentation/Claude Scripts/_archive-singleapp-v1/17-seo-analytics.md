# 17 — SEO, Structured Data & Analytics

**Goal:** Server-rendered, search-optimized pages with dynamic sitemap/robots, JSON-LD structured data, canonical + social meta, and privacy-friendly analytics. SRD NFR-701–706.

**Prerequisites:** Script `14` (storefront pages exist).

---

## Tasks

### 1. SSR / metadata (NFR-701, NFR-704)
- Ensure all product + category pages are server-rendered.
- Use Next `generateMetadata` per page: title, description, canonical URL, from product/category SEO fields (script `07`).

### 2. Sitemap & robots (NFR-702)
- Dynamic `app/sitemap.ts` (products, categories, static pages) and `app/robots.ts`. Regenerate as catalog changes.

### 3. Structured data — JSON-LD (NFR-703)
- `Product` (name, image, price, availability, aggregateRating), `BreadcrumbList`, `Organization` schemas. Inject via `<script type="application/ld+json">` on the relevant pages.

### 4. Social meta (NFR-706)
- OpenGraph + Twitter Card tags on all pages; product OG image from Cloudinary (dynamic OG image optional via `@vercel/og`).

### 5. Analytics (NFR-705, Should)
- Integrate **Plausible** (privacy-friendly, cookieless) or GA4. Track pageviews + key conversion events (add-to-cart, begin-checkout, purchase). Gate behind cookie consent where required (GDPR — CR-005).

### 6. Cookie consent + GDPR (CR-005)
- Cookie consent banner; data export + account deletion (30-day grace — FR-114) surfaced in account settings.

### 7. Error monitoring (optional)
- Sentry (Next.js SDK) for runtime error tracking if desired; scrub PII.

---

## Acceptance criteria
- [ ] Product/category pages are SSR with correct canonical + meta tags.
- [ ] `/sitemap.xml` and `/robots.txt` generate dynamically and include products/categories.
- [ ] Product pages emit valid JSON-LD (validate with Google Rich Results test).
- [ ] OpenGraph/Twitter previews render correctly when shared.
- [ ] Analytics records pageviews + purchase events; consent banner works.
- [ ] Data export + account deletion (30-day grace) available to customers.
