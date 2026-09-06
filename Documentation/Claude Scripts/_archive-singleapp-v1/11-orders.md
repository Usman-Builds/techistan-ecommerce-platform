# 11 — Order Management

**Goal:** Order lifecycle management, unique order numbers, customer order views, shipment tracking, notes, and returns. SRD FR-501–FR-509.

**Prerequisites:** Script `10` (orders created via checkout).

---

## Tasks

### 1. Order numbers (FR-502)
- Generate `ORD-YYYYMMDD-XXXX` (date + zero-padded daily sequence or short random), unique, at order creation.

### 2. Lifecycle & transitions (FR-501)
- Enforce valid status transitions: `PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED → COMPLETED` (+ `CANCELLED`, `REFUNDED`). Reject invalid jumps in the service layer.
- Each transition writes an `AuditLog` + optionally a `ShipmentEvent` and triggers the relevant email hook (script `16`).

### 3. Customer order APIs & views (FR-505, FR-512)
- tRPC `orders` (`customerProcedure`): `list` (filter + search — FR-112), `getById`, `cancel` (only while cancellable), `requestReturn`.
- Storefront `app/(storefront)/account/orders/` — list + detail with **real-time status**, itemized receipt, tracking link.

### 4. Admin order management (FR-506, FR-803)
- tRPC `ordersAdmin` (`adminProcedure`): `listAll` (filter by status/date range/customer/payment status), `getById`, `updateStatus`, `addNote`, `processRefund` (from script `10`), `setTracking`.
- Admin UI in script `15`; deliver the API here.

### 5. Shipment tracking (FR-504)
- `setTracking(orderId, { carrier, trackingNumber })` → creates a `ShipmentEvent`, generates a **carrier tracking URL** (map of carrier → URL template), moves status to `SHIPPED`, triggers shipping email.

### 6. Notes (FR-507)
- `OrderNote` with visibility INTERNAL vs CUSTOMER. Customer-visible notes appear on the customer order page.

### 7. Returns / exchanges (FR-508, Should)
- `requestReturn(orderId, { reasonCode, items })` → `ReturnRequest` (status REQUESTED). Admin `approveReturn/rejectReturn`. Reason-code enum.

### 8. Invoice PDF (FR-509, Should)
- `getInvoicePdf(orderId)` — generate a branded PDF (e.g. `@react-pdf/renderer`) itemized receipt; downloadable by customer + admin.

---

## Acceptance criteria
- [ ] Every order has a unique `ORD-YYYYMMDD-XXXX` number.
- [ ] Invalid status transitions are rejected; valid ones log + (later) email.
- [ ] Customer sees live order status, itemized receipt, and a working carrier tracking link.
- [ ] Admin can filter orders and change status; setting tracking moves order to SHIPPED.
- [ ] Return request workflow (request → approve/reject) works.
- [ ] Invoice PDF downloads with correct totals.
