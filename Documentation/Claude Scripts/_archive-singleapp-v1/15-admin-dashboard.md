# 15 — Admin Dashboard

**Goal:** Complete the admin panel UI on top of the admin APIs from earlier scripts: analytics home, product/order/customer/inventory/coupon/review management, media library, store settings, audit log, and exports. SRD FR-801–FR-810.

**Prerequisites:** Scripts `05` (admin auth + shell), `06`–`13` (admin APIs). Reuses the admin shell/layout and theme system.

---

## Sections

### 1. Dashboard home (FR-801)
- KPI cards: revenue (today/week/month/year), order count, conversion rate, AOV. Charts (revenue over time, top products). Low-stock + pending-reviews quick alerts.
- tRPC `analyticsAdmin`: `revenueSummary`, `topProducts`, `orderStats`, `conversion`. Use efficient aggregate queries.

### 2. Products (FR-802)
- List (search, status filter, pagination), bulk actions (activate/archive/delete/price update), create/edit (full editor from script `07`), duplicate.

### 3. Orders (FR-803)
- List with filters (status, date range, customer, payment status), detail view with status transitions, refund processing, tracking entry, notes (internal + customer-visible).

### 4. Customers (FR-804)
- List/search, profile view (order history, addresses), account status toggle (active/**banned**).

### 5. Inventory (FR-805)
- Stock levels across variants, **low-stock alerts** with configurable threshold (from settings), quick stock adjustments.

### 6. Coupons & promotions (FR-806)
- Manage coupons + automatic discounts + sale schedules (from script `12`), view redemption analytics.

### 7. Reviews
- Moderation queue (approve/reject) from script `13`.

### 8. Media library (FR-807)
- From script `06`.

### 9. Store settings (FR-810)
- Name, logo, contact info, currency, tax rules, shipping zones, socials — edits the `StoreSetting` singleton. Changing currency/logo reflects storefront.

### 10. Audit log (FR-808)
- Searchable/filterable view of all admin actions (who/what/when).

### 11. Exports (FR-809)
- Orders CSV, customers CSV, products CSV (streamed downloads).

---

## Cross-cutting
- Every admin mutation is `adminProcedure`/`superAdminProcedure` gated and writes an `AuditLog`.
- Consistent data table component (sort, filter, paginate, bulk-select) reused across sections.
- Dark/light + accessible + responsive (admins on tablets/laptops).

---

## Acceptance criteria
- [ ] Dashboard shows accurate revenue/orders/top-products from real seeded/test data.
- [ ] Full product, order, customer, inventory, coupon, review, media, settings management all functional.
- [ ] Low-stock alerts fire at the configured threshold.
- [ ] CSV exports download correctly for orders, customers, products.
- [ ] Audit log records every admin mutation; non-admins are blocked at the API layer.
- [ ] Store settings changes (currency, logo) reflect on the storefront.
