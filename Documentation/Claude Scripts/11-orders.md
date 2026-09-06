# 11 — Order Management

**Goal:** Order lifecycle management — unique order numbers, enforced status transitions, customer + admin order APIs, shipment tracking, internal/customer notes, returns, and invoice PDFs. Backend logic extends the NestJS `order` module (REST, RBAC-guarded); **both** clients are touched: `user_client` gets account order history/detail + returns UI, `admin_client` gets order management/fulfillment/refund actions. SRD FR-501–FR-509.

**Prerequisites:** Script `10` (orders created via checkout; `payment` module + `processRefund`). `05` (roles/RBAC — `RolesGuard`, `@Roles`). Schema entities from `03` (`Order`, `OrderItem`, `ShipmentEvent`, `OrderNote`, `ReturnRequest`, `AuditLog`); add any missing ones here and run a Prisma migration.

> ⚠️ **Architecture reminder (`00-BUILD-ORDER.md`):** one NestJS backend, REST, typed `apiClient` (`credentials: "include"`), Passport JWT (httpOnly cookie), RBAC via `RolesGuard` + `@Roles`, money as **integer cents**, npm. Admin-only endpoints are `@Roles('ADMIN','SUPER_ADMIN')`-guarded server-side (NFR-208) — never UI-only.
>
> ⚠️ **Next.js 16 (`00 §7`):** before writing ANY client code (either app), `npm install` in that client and read the relevant guides under `node_modules/next/dist/docs/`. Do not assume older Next conventions.

---

## Tasks

### 1. [Backend] Order numbers (FR-502)
- Generate `ORD-YYYYMMDD-XXXX` (date + zero-padded daily sequence, or short random with a uniqueness check) at order creation. Store on `Order.orderNumber` (unique). Wire generation into the `createOrder` path from script `10`.

### 2. [Backend] Lifecycle & status transitions (FR-501)
- Enforce valid transitions in `OrderService` (service layer, not the client): `PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED → COMPLETED`, plus `CANCELLED` and `REFUNDED`. Reject invalid jumps with a clear error.
- Each transition writes an `AuditLog` entry, optionally a `ShipmentEvent`, and fires the relevant email hook (script `16`).

### 3. [Backend] Customer order endpoints (FR-505, FR-512)
- On `OrderController`, guarded by `JwtAuthGuard` + `@Roles('CUSTOMER')`, scoped to the authenticated user's own orders:
  - `GET /orders` — list with filter + search (status, date — FR-112).
  - `GET /orders/:id` — full detail (items, totals in cents, status, tracking, customer-visible notes).
  - `POST /orders/:id/cancel` — only while cancellable (transition guard).
  - `POST /orders/:id/return` — request a return (Task 7).

### 4. [Backend] Admin order endpoints (FR-506, FR-803)
- Admin routes under an `/admin/orders` prefix (or the same controller with `@Roles('ADMIN','SUPER_ADMIN')` + `RolesGuard`):
  - `GET /admin/orders` — list all with filters (status, date range, customer, payment status).
  - `GET /admin/orders/:id` — full detail incl. internal notes.
  - `PATCH /admin/orders/:id/status` — `updateStatus` (transition-guarded).
  - `POST /admin/orders/:id/notes` — add note (Task 6).
  - `POST /admin/orders/:id/tracking` — set tracking (Task 5).
  - `POST /admin/orders/:id/refund` — calls `PaymentService.processRefund` from script `10` (full/partial).
- All mutations write an `AuditLog` entry.

### 5. [Backend] Shipment tracking (FR-504)
- `setTracking(orderId, { carrier, trackingNumber })` → create a `ShipmentEvent`, generate a **carrier tracking URL** from a `carrier → URL-template` map, transition the order to `SHIPPED`, and fire the shipping email hook (script `16`). DTO-validated carrier enum.

### 6. [Backend] Order notes (FR-507)
- `OrderNote` with `visibility` = `INTERNAL` | `CUSTOMER`. Internal notes are admin-only; `CUSTOMER`-visible notes appear on the customer order detail page. Add via the admin notes endpoint.

### 7. [Backend] Returns / exchanges (FR-508, Should)
- Customer `POST /orders/:id/return` — `{ reasonCode, items }` → create a `ReturnRequest` (status `REQUESTED`); reason-code enum, DTO-validated, only for eligible (e.g. delivered) orders.
- Admin `POST /admin/orders/:id/return/:returnId/approve` and `.../reject` → transition the `ReturnRequest`; approval may trigger a refund (Task 4) + email hook.

### 8. [Backend] Invoice PDF (FR-509, Should)
- `GET /orders/:id/invoice` (customer, own order) and `GET /admin/orders/:id/invoice` (admin) → generate a branded, itemized PDF (e.g. `@react-pdf/renderer` or `pdfkit`) with correct totals in cents, streamed as `application/pdf`.

### 9. [user_client] Account order history & detail (FR-505)
- `npm install` + read `node_modules/next/dist/docs/` first.
- `src/app/account/orders/` — list page (status/date filter, order number, total, status badge) + `[id]` detail page: itemized receipt, live status, tracking link, customer-visible notes, invoice download. Data via the typed `apiClient` + TanStack Query (`useOrders`, `useOrder`).

### 10. [user_client] Returns UI (FR-508)
- On an eligible order's detail page, a "Request return" flow: select items + reason code, submit to `POST /orders/:id/return`, show request status. Functional here; polish in script `14`.

### 11. [admin_client] Order management & fulfillment
- `npm install` + read `node_modules/next/dist/docs/` first.
- `src/app/orders/` — list with filters (status, date range, customer, payment status), pagination, search; `[id]` detail with: status transition control (fulfillment), set-tracking form, add-note (internal/customer), refund action (full/partial), approve/reject returns, invoice download.
- All actions call the **RBAC-guarded** admin endpoints via the admin `apiClient` (`credentials: "include"`) + TanStack Query mutations with `invalidateQueries`. The client hides actions by role, but authorization is enforced server-side (NFR-208). Deeper dashboard polish is script `15`.

---

## Acceptance criteria
- [ ] Every order has a unique `ORD-YYYYMMDD-XXXX` number.
- [ ] Invalid status transitions are rejected in the service layer; valid ones write an audit log + fire the email hook.
- [ ] A customer sees only their own orders with live status, itemized receipt, customer-visible notes, and a working carrier tracking link.
- [ ] Setting tracking creates a `ShipmentEvent`, builds the carrier URL, and moves the order to `SHIPPED`.
- [ ] Return workflow (customer request → admin approve/reject) works end-to-end.
- [ ] Invoice PDF downloads with correct cents-based totals for both customer and admin.
- [ ] Admin order endpoints are `RolesGuard`-protected; a customer/guest calling them gets 403; the `admin_client` UI drives them successfully.
- [ ] Refund action from `admin_client` invokes `processRefund` (script `10`) and updates order/payment status.
