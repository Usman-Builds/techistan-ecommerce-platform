# 15 — Admin Dashboard (admin_client)

**Goal:** Build the complete **admin panel UI** in `Code/frontend/admin_client` (Next.js 16, port **3002**) on top of the admin REST endpoints from earlier scripts: a dashboard with KPIs/analytics, and management screens for products, orders, customers, inventory, coupons/promotions, reviews, media, and store settings, plus an audit-log viewer and CSV exports. Everything is behind **admin auth + RBAC** (`ADMIN` / `SUPER_ADMIN`), enforced at the backend API layer — the UI never grants access the API wouldn't. This is a **frontend** script: it consumes admin REST endpoints already built; it does not define new backend modules (any gap is flagged as a small backend addition). SRD FR-801–FR-810.

**Prerequisites:**
- Scripts `01` (deps, ports, typed `apiClient`, TanStack Query in `admin_client`), `02` (shared brand theme — same tokens as storefront), `05` (admin login + RBAC + admin **shell/layout**: sidebar + topbar + middleware guarding `/**` except `/login`), `06`–`13` (media, catalog, search, cart/coupons, checkout/refunds, orders, promotions, reviews admin REST endpoints).
- Backend on `:3000`; `admin_client` calls it via `NEXT_PUBLIC_API_URL` with `credentials: "include"` (httpOnly JWT cookie). All admin calls hit **role-guarded** endpoints (`RolesGuard` + `@Roles()`); each mutation writes an `AuditLog` server-side.
- ⚠️ **Next.js 16 — read the local docs first.** Before writing any client code, read `Code/frontend/admin_client/node_modules/next/dist/docs/` for **routing, layouts & route groups, `generateMetadata`, `next/font`, `next/image`, Server Components, Server Actions, and middleware**. Next 16 has breaking changes — do **not** assume Next 13/14/15 conventions (async `params`/`searchParams`, `cookies()`/`headers()`, caching defaults, `<Image>` API, middleware matcher may differ). Heed deprecations.

---

## Architecture notes (apply throughout)

- **App:** `Code/frontend/admin_client` only. Reuse the shell/layout, `apiClient`, and middleware from script `05`.
- **Data access:** REST via the typed `apiClient` + **TanStack Query** (admin screens are interactive/data-dense, so most are Client Components using query/mutation hooks with cache invalidation). Use Server Components for the initial shell and static framing. No direct DB access, no tRPC.
- **RBAC is server-enforced:** every list/mutation calls a role-guarded endpoint; a `CUSTOMER` or unauthenticated user is blocked at the API even if a route leaks. Hide/disable `SUPER_ADMIN`-only actions in the UI, but rely on the backend as the source of truth (NFR-208).
- **Theme:** same shared brand tokens as the storefront (`@shared/theme/brand`), dark/light via `next-themes`. Never hardcode a hex/font.
- **Money:** amounts are **integer cents**; render via `formatMoney(cents, currency)` (currency from store settings). Inputs that accept money convert to cents before sending.
- **Reusable `DataTable`:** build one accessible table component (server-driven **sort, filter, paginate, bulk-select**, column visibility, sticky header, keyboard-navigable) and reuse it across every list screen. Every list has **loading (skeleton)**, **empty**, and **error (retry)** states.
- **Animation / a11y:** Framer Motion ≤300ms, `prefers-reduced-motion` respected; WCAG 2.1 AA, full keyboard nav, contrast ≥4.5:1, labelled controls. Responsive for **tablet + laptop** (admins aren't on phones, but must not break < 1024px).

### Admin REST endpoints consumed (reference, do not rebuild)

| Section | Endpoints (indicative, all role-guarded under `/admin/*`) |
|---|---|
| Analytics | `GET /admin/analytics/revenue-summary`, `/top-products`, `/order-stats`, `/conversion` |
| Products | `GET /admin/products`, `POST`, `PATCH /:id`, `DELETE /:id`, `POST /:id/duplicate`, `POST /bulk` |
| Categories | `GET /categories/tree`, `POST/PATCH/DELETE /admin/categories`, `PATCH /admin/categories/reorder` |
| Orders | `GET /admin/orders`, `GET /:id`, `PATCH /:id/status`, `POST /:id/refund`, `POST /:id/tracking`, `POST /:id/notes` |
| Customers | `GET /admin/customers`, `GET /:id`, `PATCH /:id/status` (active/banned) |
| Inventory | `GET /admin/inventory`, `GET /admin/inventory/low-stock`, `PATCH /admin/inventory/:variantId` |
| Coupons/promotions | `GET/POST/PATCH/DELETE /admin/coupons`, `GET /admin/coupons/:id/redemptions`, sale schedules |
| Reviews | `GET /admin/reviews` (filter by status), `POST /:id/approve`, `POST /:id/reject` |
| Media | `GET /admin/media`, upload signature, `DELETE /:id` (from script `06`) |
| Settings | `GET /admin/settings`, `PATCH /admin/settings` (StoreSetting singleton) |
| Audit log | `GET /admin/audit-logs` (filter who/what/when) |
| Exports | `GET /admin/exports/orders.csv`, `/customers.csv`, `/products.csv` (streamed) |

> **Missing-endpoint flags (small backend additions if absent):** the **analytics** aggregate endpoints (`revenue-summary`, `top-products`, `order-stats`, `conversion`) and the **CSV export** streams are the most likely gaps — earlier scripts reference analytics/export "stubs" but may not expose HTTP routes. If missing, add a minimal role-guarded `admin/analytics` controller (efficient aggregate queries) and streamed CSV endpoints in the backend rather than computing on the client. Note each addition explicitly.

---

## Tasks

### 1. Read Next 16 docs, then finalize the admin shell
- Read the `node_modules/next/dist/docs/` guides listed above.
- Reuse the shell from script `05` (`app/(admin)/layout.tsx` or root layout): collapsible **sidebar nav** (Dashboard, Products, Orders, Customers, Inventory, Coupons, Reviews, Media, Settings, Audit Log), **topbar** (breadcrumbs, notification bell, admin name, ThemeToggle, sign-out). Active-route highlighting, keyboard-navigable, responsive collapse.
- Confirm middleware guards all admin routes except `/login`; unauthenticated → `/login`, non-admin → blocked.

### 2. Build the shared `DataTable` + primitives
- One accessible, reusable `DataTable` (sort, server-side pagination, filter chips, bulk-select with a sticky action bar, empty/loading/error states). Plus shared `StatCard`, `Chart` wrapper, `StatusBadge`, `ConfirmDialog`, `FilterBar`, and `ExportButton`. Every subsequent screen composes these.
- Use a lightweight charting lib for the analytics charts (respect theme tokens for series colors; ensure ≥3:1 non-text contrast and a legend, not color-only encoding).

### 3. Dashboard home (FR-801)
- **KPI cards**: revenue (today/week/month/year), order count, conversion rate, AOV — from `GET /admin/analytics/revenue-summary` + `/order-stats` + `/conversion`.
- **Charts**: revenue over time, top products (`GET /admin/analytics/top-products`). Efficient aggregate queries server-side (flag as backend addition if the endpoints don't exist yet).
- **Quick alerts**: low-stock items (`/admin/inventory/low-stock`) and pending reviews (`/admin/reviews?status=PENDING`) with links to their screens.
- Date-range selector driving the analytics queries.

### 4. Products (FR-802)
- List via `DataTable` (`GET /admin/products`): search, status filter (Draft/Active/Archived), pagination.
- **Bulk actions** (`POST /admin/products/bulk`): activate / archive / delete / price update. **Duplicate** (`POST /:id/duplicate`).
- Create/Edit: reuse the full product editor from script `07` (title, slug, rich-text description, status, category picker from `GET /categories/tree`, tags, SEO panel, **variant builder**, images via the `MediaUploader` from script `06`). Money entered in currency, stored/sent as cents.

### 5. Orders (FR-803)
- List (`GET /admin/orders`) with filters: status, date range, customer, payment status.
- Detail (`GET /admin/orders/:id`): itemized summary, **status transitions** (`PATCH /:id/status`, valid transitions only), **refund** processing full/partial (`POST /:id/refund`, Stripe), **tracking entry** (`POST /:id/tracking` → carrier + number → moves to SHIPPED), and **notes** with INTERNAL vs CUSTOMER visibility (`POST /:id/notes`).

### 6. Customers (FR-804)
- List/search (`GET /admin/customers`); profile view (`GET /:id`) with order history + addresses; **account status toggle** active/**banned** (`PATCH /:id/status`).

### 7. Inventory (FR-805)
- Stock levels across variants (`GET /admin/inventory`), **low-stock alerts** at the configurable threshold from store settings (`/admin/inventory/low-stock`), and **quick stock adjustments** (`PATCH /admin/inventory/:variantId`) with optimistic update + reconcile.

### 8. Coupons & promotions (FR-806)
- Manage coupons + automatic discounts + sale schedules from script `12` (`GET/POST/PATCH/DELETE /admin/coupons`): list with status, create/edit form (type PERCENT/FIXED/FREE_SHIPPING, value, usage/per-customer limits, min order, start/expiry dates, active toggle). **Redemption analytics** per coupon (`GET /admin/coupons/:id/redemptions`).

### 9. Reviews moderation
- Moderation queue (`GET /admin/reviews?status=`) with approve/reject (`POST /:id/approve|reject`) from script `13`. Show product, rating, body, photos; approving updates the product aggregate. New-submission alert surfaced on the dashboard/bell.

### 10. Media library (FR-807)
- Grid of Cloudinary assets from script `06` (`GET /admin/media`): search, copy-URL, delete (removes from Cloudinary + DB). Reused by the product editor.

### 11. Store settings (FR-810)
- Edit the `StoreSetting` singleton (`GET/PATCH /admin/settings`): name, logo, contact info, **currency**, tax rules, shipping zones, socials, low-stock threshold. Changing **currency/logo reflects on the storefront** (shared settings source). Validate inputs; confirm destructive changes.

### 12. Audit log (FR-808)
- Searchable/filterable viewer (`GET /admin/audit-logs`) of all admin actions: who / what / when / target, with filter chips and pagination. Read-only.

### 13. Exports (FR-809)
- `ExportButton` triggering streamed downloads: orders CSV, customers CSV, products CSV (`GET /admin/exports/*.csv`). Respect current filters where sensible; show progress; handle large-file streaming without buffering in the browser. Flag the CSV endpoints as a backend addition if they don't yet exist.

### 14. Cross-cutting polish
- Consistent loading/empty/error states on every screen (via the shared primitives). Optimistic mutations with rollback + toast feedback. Dark/light parity. Keyboard and screen-reader passes on the `DataTable` and dialogs.

---

## Acceptance criteria

- [ ] Next 16 docs in `admin_client/node_modules/next/dist/docs/` were consulted; routing/metadata/middleware/server-component APIs match the installed version (no 13/14/15 assumptions).
- [ ] All admin screens live in `admin_client`, use the script-`05` shell, and render in **both dark and light**, responsive for tablet/laptop.
- [ ] Every admin API call hits a **role-guarded** endpoint; a `CUSTOMER`/unauthenticated user is blocked at the API layer, and non-admins cannot reach any admin route.
- [ ] Dashboard shows accurate revenue / orders / conversion / AOV / top-products from real seeded/test data via the analytics endpoints.
- [ ] Full **product, order, customer, inventory, coupon, review, media, settings** management is functional against the REST API, reusing one shared `DataTable`.
- [ ] Order status transitions enforce validity; refunds (full/partial) and tracking entry work; notes respect INTERNAL vs CUSTOMER visibility.
- [ ] Low-stock alerts fire at the configured threshold; quick stock adjustments persist.
- [ ] CSV exports (orders, customers, products) download correctly as streams.
- [ ] Audit-log viewer lists who/what/when and is searchable/filterable; every mutation is recorded server-side.
- [ ] Store-settings changes (currency, logo, threshold) reflect on the storefront.
- [ ] All money renders via `formatMoney` from integer cents; money inputs are converted to cents before sending.
- [ ] Any endpoint the admin UI needed but that did not exist is documented and added as a minimal role-guarded backend route (notably `admin/analytics/*` and CSV exports).
