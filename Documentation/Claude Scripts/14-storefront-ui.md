# 14 — Storefront UI (user_client)

**Goal:** Build the polished, accessible, responsive **customer storefront** in `Code/frontend/user_client` (Next.js 16, port **3001**) on top of the backend REST API from earlier scripts. Deliver every SRD §8.1 page — home, category/listing, product detail (PDP), search results, cart, checkout, order confirmation, account area, and auth pages — with a consistent shell, the shared brand theme (dark/light), Framer Motion micro-interactions, and complete loading/empty/error states. This is a **frontend** script: it consumes catalog/search/cart/order REST endpoints already built; it does **not** define new backend modules (any gap is noted as a small backend addition).

**Prerequisites:**
- Scripts `01` (deps installed in `user_client`, ports set, typed `apiClient`, TanStack Query provider), `02` (shared brand theme + `ThemeProvider`/`ThemeToggle`), `04` (storefront auth), `06` (Cloudinary `next/image` loader), `07`–`13` (catalog, search, cart, checkout, orders, promotions, reviews REST endpoints).
- Backend running on `:3000`; `user_client` reaches it via `NEXT_PUBLIC_API_URL` with `credentials: "include"` (httpOnly JWT cookie).
- ⚠️ **Next.js 16 — read the local docs first.** Before writing any client code, read the relevant guides in `Code/frontend/user_client/node_modules/next/dist/docs/` for **routing, layouts & route groups, `generateMetadata`, `next/font`, `next/image`, Server Components, and Server Actions**. Next 16 has breaking changes — do **not** assume Next 13/14/15 conventions (async `params`/`searchParams`, `cookies()`/`headers()` behavior, caching defaults, `<Image>` API, metadata shape may differ). Heed deprecation notices.

---

## Architecture notes (apply throughout)

- **App:** `Code/frontend/user_client` only. Do not touch `admin_client`, `backend`, or `shared` except to consume them.
- **Data access:** all data comes from the backend **REST API** via the typed `apiClient` (`src/lib/api/`). Reads that must be SSR/SEO-critical run in **Server Components** (fetch on the server, forwarding the request cookie); interactive/mutating reads use **TanStack Query** hooks in Client Components. No direct DB access, no tRPC.
- **Server vs Client Components:** default to **Server Components**. Add `"use client"` only for interactivity (cart drawer, variant selector, forms, filters, theme toggle, carousels). Keep client bundles small; leverage **React 19 + React Compiler** (no manual `useMemo`/`useCallback` churn).
- **Theme:** consume semantic tokens from the shared brand theme (`@shared/theme/brand` → CSS vars). Never hardcode a hex or font. Dark/light via `next-themes`.
- **Money:** all prices arrive as **integer minor units (cents)**. Render only through a central `formatMoney(cents, currency)` util (currency from public store settings). Never do float math in the UI.
- **Animation:** Framer Motion, durations **≤300ms**, always gated on `prefers-reduced-motion` (provide a `useReducedMotion` wrapper / motion-safe variants).
- **Accessibility (WCAG 2.1 AA):** semantic HTML, ARIA landmarks, full keyboard nav, visible focus rings, contrast **≥4.5:1**, alt text on every image, labelled form controls, focus trapping in drawers/modals.
- **State machine per data view:** every list/detail must render distinct **loading (skeleton)**, **empty (friendly)**, and **error (retry)** states; wrap route segments in `loading.tsx` + `error.tsx` boundaries.

### REST endpoints consumed (from earlier scripts — reference, do not rebuild)

| Concern | Endpoints (indicative) |
|---|---|
| Public store settings | `GET /settings` (logo, name, currency, socials, shipping zones) |
| Catalog | `GET /products` (filter/sort/paginate), `GET /products/:slug`, `GET /categories/tree` |
| Search | `GET /search?q=`, `GET /search/suggest`, `GET /search/facets`, `GET /recently-viewed` |
| Cart | `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`, `POST /cart/coupon`, `DELETE /cart/coupon`, `POST /cart/estimate-shipping` |
| Wishlist | `GET /wishlist`, `POST /wishlist`, `DELETE /wishlist/:productId`, `POST /wishlist/:productId/move-to-cart` |
| Checkout | `POST /checkout/order` (idempotency-key → `clientSecret`), Stripe.js/Elements client-side |
| Orders | `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/return`, `GET /orders/:id/invoice` |
| Reviews | `GET /products/:id/reviews`, `POST /reviews`, `POST /reviews/:id/helpful` |
| Auth / account | `POST /auth/login`, `POST /auth/register`, `GET /auth/me`, `PATCH /account/profile`, `GET/POST/PATCH/DELETE /account/addresses`, `GET /notifications` |

> **Missing-endpoint flags (small backend additions if absent):** a public `GET /settings` projection safe for the storefront; a `GET /products?featured=true` (or `GET /home` composite) for the homepage; `GET /recently-viewed`. Note any that don't yet exist and add a minimal read endpoint in the owning backend module rather than fetching private data.

---

## Tasks

### 1. Read Next 16 docs, then lay down the storefront shell
- Read `node_modules/next/dist/docs/` (routing, layouts/route groups, metadata, fonts, image) as required above.
- Root `app/layout.tsx` (Server Component): load `next/font` from `brand.fonts`, mount `ThemeProvider`, `QueryClientProvider`, and a `CartProvider` (Zustand for guest mirror). Set default metadata + `<html lang>` + skip-to-content link.
- Group storefront routes under a route group (e.g. `app/(storefront)/`). Build:
  - **Header** (`components/storefront/Header.tsx`): logo (from `GET /settings`), primary nav with **category mega-menu** (from `GET /categories/tree`), search bar (autocomplete), cart icon → opens `CartDrawer` with live item count, account menu (auth-aware via `GET /auth/me`), and the shared **ThemeToggle**. Sticky, keyboard-operable, mobile hamburger.
  - **Footer**: link columns, newsletter signup, social links, payment badges.
- Mobile-first responsive **320px–2560px** (NFR-506). Verify no horizontal scroll at 320px.

### 2. Home (`/`)
- Server Component. Hero banner, **featured products grid**, category highlights, newsletter signup — data-driven from active products + settings (`GET /products?featured=true`, `GET /categories/tree`, `GET /settings`).
- Stream below-the-fold sections with Suspense. Above-the-fold hero image uses `next/image` with `priority`.
- Subtle entrance animation on cards (staggered, ≤300ms, motion-safe).

### 3. Category / Listing (`/c/[...slug]`)
- **SSR** for SEO (NFR-701). Read `params` (Next 16 async) → resolve category → `GET /products` with category + facet filters, `GET /search/facets` for counts.
- Sidebar **faceted filters** (category, price range, brand, rating, availability), **sort** controls (relevance/price asc-desc/newest/best-selling/top-rated), and pagination **or** infinite scroll. Filters reflect into URL `searchParams` so results are shareable/back-button-safe.
- Reusable `ProductCard` (image, title, price + compare-at/sale badge, aggregate stars, quick add-to-cart/wishlist). Grid has loading skeletons, an empty state ("no products match these filters — clear filters"), and an error boundary.

### 4. Product Detail — PDP (`/p/[slug]`)
- **SSR** via Server Component using `GET /products/:slug`. Implement `generateMetadata` (title/description/canonical/OG) from the product SEO fields (JSON-LD Product lands in script `17`).
- **Image gallery** with thumbnails + zoom (Client Component, keyboard + arrow-key navigable, alt text per image).
- **Variant selector** that respects stock (disable/annotate out-of-stock combinations), price + compare-at with **Sale** badge when a sale window is active, **add-to-cart** and **add-to-wishlist**.
- Description (rich text, sanitized), **Reviews tab** (aggregate stars + distribution, approved reviews paginated, verified-purchaser write-review form gated on eligibility, helpful vote, photo thumbnails — from script `13`), and a **related products** rail.
- Fire a recently-viewed record (client, best-effort). Handle 404 for unknown slug via `not-found.tsx`.

### 5. Search Results (`/search`)
- Query bar bound to `?q=`; **debounced autocomplete ≤200ms** (`GET /search/suggest`). Results via `GET /search?q=` with result count, highlighted matches (`ts_headline` snippets), the same facet filters + sort as listing.
- Empty state suggests corrections/popular categories when zero results.

### 6. Cart (`/cart`) + `CartDrawer`
- Both surfaces share the same data (`GET /cart`) and mutations. Line items with variant details, **quantity steppers** (clamped to stock, optimistic update + reconcile), remove, **coupon input** with clear valid/invalid feedback (`POST /cart/coupon`), estimated shipping (`POST /cart/estimate-shipping`), subtotal/estimated total (from cents), and a **Proceed to checkout** CTA.
- Surface per-line stock issues returned by the API before checkout. Guest cart mirrored in Zustand for instant UI; merged server-side on login.
- Drawer is a focus-trapped slide-over, dismissable via Esc, motion-safe (≤300ms).

### 7. Checkout (`/checkout`)
- Finalize the multi-step UI (Shipping → Payment → Review → Confirmation) with a persistent **order-summary sidebar**. Saved addresses for logged-in customers; free entry for guests.
- **Payment** uses **Stripe.js / Elements** (Payment Element) only — no raw card data touches our code. Create the order via `POST /checkout/order` with a generated **idempotency key**, receive `clientSecret`, confirm on the client. Totals are recomputed server-side; display them read-only.
- Robust error handling for declined cards / network failures; disable double-submit; preserve entered data across step navigation.

### 8. Order Confirmation (`/checkout/confirmation/[orderNumber]`)
- Thank-you, order number, itemized summary, estimated delivery, and continue-shopping CTA. Read via `GET /orders/:id` (or by order number). Handle the "webhook not yet processed" window gracefully (pending state that resolves).

### 9. Account area (`/account/**`)
- Gate to authenticated `CUSTOMER` (middleware redirect to `/login`; consult Next 16 middleware docs). Sections:
  - **Profile** — name, email, phone, avatar upload via Cloudinary (`PATCH /account/profile`).
  - **Addresses** — list/add/edit/delete, **max 10**, set default.
  - **Orders** — history + detail with live status, itemized receipt, tracking link, cancel/return actions, invoice download (`GET /orders`, `/orders/:id`, `/cancel`, `/return`, `/invoice`).
  - **Wishlist** — grid with move-to-cart / remove.
  - **Saved payment methods** — tokenized display only (last4/brand); never store PAN.
  - **Notifications** — in-app center (`GET /notifications`) with unread count (finalized in script `16`).

### 10. Auth pages
- Style the storefront auth pages from script `04` to the brand: `/login` (email+password + **Continue with Google** + show/hide password), `/register` (with **password-strength meter** + inline validation), `/verify-email`, `/forgot-password`, `/reset-password`. Accessible forms (`react-hook-form` + Zod), keyboard-navigable, clear error/success feedback.

### 11. Cross-cutting polish & performance
- **Loading/empty/error** for every data view: `loading.tsx` skeletons per segment, friendly empties, `error.tsx` with retry (NFR-304).
- **Performance:** `next/image` with the Cloudinary loader (WebP/AVIF, responsive `srcset`, lazy below the fold, `priority` for LCP image), streaming/Suspense, minimal client JS (Server Components by default). Target Core Web Vitals (NFR-101–108).
- **Animation:** centralize motion variants; respect `prefers-reduced-motion` everywhere.
- Remove or dev-gate the temporary `/theme-preview` page from script `02`.

---

## Acceptance criteria

- [ ] Next 16 docs in `user_client/node_modules/next/dist/docs/` were consulted; routing/metadata/font/image/server-component APIs match the installed version (no 13/14/15 assumptions).
- [ ] All SRD §8.1 pages exist under `user_client` and are responsive from **320px to 2560px** in **both dark and light**.
- [ ] A shopper can **browse → filter → open a PDP → add to cart → checkout (Stripe test card) → see confirmation** end-to-end against the REST API.
- [ ] Catalog, PDP, and category pages are **SSR** (Server Components); interactive surfaces (cart, filters, variant selector, forms) are Client Components only where needed.
- [ ] All prices render via `formatMoney` from integer cents in the store currency; no float math in the UI.
- [ ] Every list/detail view has distinct **loading (skeleton)**, **empty**, and **error (retry)** states.
- [ ] Keyboard-only navigation works across the primary flow; focus is visible and trapped in drawers/modals; automated a11y check (axe) passes on home, listing, PDP, cart, checkout.
- [ ] Animations are ≤300ms and disabled under `prefers-reduced-motion`.
- [ ] No component hardcodes a hex or font; dark/light toggle works with no flash; theme comes from the shared brand tokens.
- [ ] Lighthouse Performance ≥ 90 on home + PDP (dev target; re-verified in script `18`).
- [ ] Any endpoint the storefront needed but that did not exist is documented and added as a minimal backend read (e.g. public `GET /settings`, featured products, recently-viewed).
