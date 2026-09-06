# 12 — Promotions & Discounts

**Goal:** A backend `coupon` module owning the full promotions domain — a coupon engine (PERCENT / FIXED / FREE_SHIPPING) with usage limits and expiry, automatic cart-rule discounts, scheduled sale pricing, and analytics hooks — exposed over REST with class-validator DTOs and RBAC-guarded admin writes. The `admin_client` gets the coupon, automatic-discount, and sale-management UI. SRD FR-601–FR-605, FR-806.

**Prerequisites:**
- Script `03` (Prisma schema), `05` (`role` enum + `RolesGuard`/`@Roles`), `07` (products/variants — sale pricing hangs off them).
- Script `09` (cart calls the coupon validator via `applyCoupon`) and `10` (checkout/webhook consumes the coupon and records redemption).
- Money is stored and computed in **integer minor units (cents)** throughout (`00 §9`). Admin writes are guarded by `RolesGuard` + `@Roles(ADMIN, SUPER_ADMIN)` — never client-side only (NFR-208).
- ⚠️ **Next.js 16 (admin_client):** before writing any client code, read the relevant guides in `Code/frontend/admin_client/node_modules/next/dist/docs/` (routing, data fetching, server/client components, forms). Do not assume Next 13/14/15 conventions (`00 §7`).

---

## Tasks

### 1. [backend] Prisma models (extend script 03 schema)
Add to `Code/backend/prisma/schema.prisma` (create a migration: `npx prisma migrate dev`):
- `Coupon` — `code` (unique, uppercased), `type` enum `CouponType { PERCENT FIXED FREE_SHIPPING }`, `value` (percent basis-points or fixed **cents**), `minOrderCents`, `maxDiscountCents?` (cap for PERCENT), `usageLimit?` (total), `perCustomerLimit?`, `usedCount` (denormalized), `startsAt?`, `expiresAt?`, `isActive`, timestamps.
- `CouponRedemption` — `couponId`, `userId?`, `orderId`, `discountCents`, `redeemedAt`. Unique index on `(couponId, orderId)`; index on `(couponId, userId)` for per-customer counting.
- `AutomaticDiscount` — `name`, `rule` (JSON condition, e.g. `{ "buyQty": 3, "percentOff": 1000 }`), `priority` (int, precedence), `isActive`, `startsAt?`, `expiresAt?`.
- Sale pricing on `Product`/`ProductVariant` (script 07): `salePriceCents?`, `saleStartsAt?`, `saleEndsAt?` (the base `priceCents` is the compare-at when a sale is active).

### 2. [backend] Scaffold the `coupon` module
- `src/modules/coupon/` with `coupon.module.ts`, `coupon.controller.ts`, `coupon.admin.controller.ts`, `coupon.service.ts`, `coupon.service.spec.ts`, and `dto/`.
- Register in `AppModule`; import `PrismaModule`. Export `CouponService` so `CartModule` (09) and `OrderModule`/payment webhook (10) can inject it.
- DTOs (class-validator, validated by the global `ValidationPipe`):
  - `CreateCouponDto` — `@IsString code`, `@IsEnum(CouponType) type`, `@IsInt @Min(0) value`, optional `@IsInt` limits/mins/caps, `@IsISO8601` date strings, `@IsBoolean isActive`.
  - `UpdateCouponDto extends PartialType(CreateCouponDto)`.
  - `ListCouponsQueryDto` — pagination (`@IsInt @Min(1) page/pageSize`), optional `status`/`search` filters.
  - `CreateAutomaticDiscountDto`, `UpdateAutomaticDiscountDto`, `SetSalePriceDto` (`salePriceCents`, `saleStartsAt`, `saleEndsAt`).

### 3. [backend] Coupon engine (FR-601, FR-602)
- `CouponService.validateAndApply(code, cart, user?)` → `{ valid: boolean; discountCents: number; freeShipping: boolean; reason?: string }`. Pure/deterministic; **no writes** (validation only).
- Compute discount by type: **PERCENT** (of eligible subtotal, capped by `maxDiscountCents`), **FIXED** (flat cents, never exceeding subtotal), **FREE_SHIPPING** (flag consumed by cart/checkout shipping calc in 09/10).
- Enforce every constraint and return a specific `reason` on failure: unknown code, `!isActive`, outside `startsAt`/`expiresAt` window, `minOrderCents` not met, total `usageLimit` reached, `perCustomerLimit` reached (count this user's `CouponRedemption`s).
- `recordRedemption(couponId, orderId, userId, discountCents)` — called **at order confirmation** (Stripe webhook path in 10), inside the same transaction that confirms the order. Increment `usedCount` and insert `CouponRedemption` **atomically** (transaction + unique `(couponId, orderId)`) so concurrent confirmations cannot over-redeem.

### 4. [backend] Automatic discounts (FR-603)
- `CouponService.evaluateAutomaticDiscounts(cart)` → list of applied rules with `discountCents`, run automatically at cart/checkout (no code entered).
- Evaluate active in-window `AutomaticDiscount` rows against the cart (e.g. "Buy 3, get 10% off"). Apply in `priority` order with **documented stacking precedence** (e.g. one automatic discount + one coupon; automatics apply before percentage coupons). Document the rule in a comment block at the top of the service.

### 5. [backend] Scheduled sale pricing (FR-604)
- Helper `effectivePriceCents(productOrVariant, now)` — returns `salePriceCents` when `now` is within `[saleStartsAt, saleEndsAt]` and a sale price is set, else base `priceCents`. Use it wherever price is read (catalog reads in 07, cart in 09, checkout totals in 10).
- Expose the compare-at (original) price alongside the effective price in product read responses so the storefront can render a "Sale" badge and strikethrough (styled in scripts 07/14).

### 6. [backend] Admin REST API (FR-806) — RBAC guarded
`coupon.admin.controller.ts`, prefix `admin/`, class-level `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN, SUPER_ADMIN)`:
- `POST /admin/coupons` · `GET /admin/coupons` (paginated/filtered) · `GET /admin/coupons/:id` · `PATCH /admin/coupons/:id` · `DELETE /admin/coupons/:id` · `PATCH /admin/coupons/:id/toggle` (active on/off).
- `GET /admin/coupons/:id/redemptions` — redemption list + count for a coupon.
- `POST|GET|PATCH|DELETE /admin/automatic-discounts` (CRUD).
- `PUT /admin/products/:id/sale` (and/or per-variant) to set/clear `SetSalePriceDto`.
- Every mutation writes an `AuditLog` entry (FR-808) and validates `code` uniqueness (return 409 on collision).

### 7. [backend] Analytics hooks (FR-605)
- Add `CouponService.getCouponAnalytics(couponId)` returning redemption count, **revenue attributed** (sum of `discountCents` and order totals from `CouponRedemption` → `Order`), and AOV impact. Leave the heavier aggregate query stubbed for the admin analytics screen (script 15). Emit a lightweight event/log on each redemption for later reporting.

### 8. [backend] Cart & checkout integration (09 / 10)
- Cart `applyCoupon`/`removeCoupon` (09) delegate to `CouponService.validateAndApply` and store the applied code on the cart; cart totals subtract `discountCents` and honor the `freeShipping` flag.
- Checkout (10) **re-validates** the coupon server-side at order creation (never trusts the client-sent discount) and calls `recordRedemption` only from the `payment_intent.succeeded` webhook, inside the order-confirmation transaction.

### 9. [admin_client] Promotions management UI (RBAC-guarded)
> First read `node_modules/next/dist/docs/` for the current App Router routing + data-fetching APIs (Task preamble).
- Use the typed `apiClient` (`src/lib/api`, `fetch` + `credentials: 'include'`) and **TanStack Query** for all reads/mutations; money entered/displayed via the shared `formatMoney(cents)` helper (percent values shown as %, stored as basis points).
- Gate all promotion routes behind the admin session (redirect non-admins); the backend `RolesGuard` remains the real enforcement.
- **Coupons** — `app/coupons/`: list (code, type, value, usage `usedCount/usageLimit`, window, active) with search + status filter and pagination; create/edit form (type selector, value, min order, usage + per-customer limits, max-discount cap, start/expiry, active toggle); a redemptions detail view. React Hook Form + Zod schemas mirroring the DTOs.
- **Automatic discounts** — `app/discounts/`: list + create/edit rule form (condition builder for the JSON rule, priority, window, active).
- **Sales** — `app/sales/` (or a "Sale" panel on the product editor from 07): set/clear `salePriceCents` + schedule window per product/variant; show effective vs compare-at preview.
- Functional here; final polish in script 15.

---

## Acceptance criteria
- [ ] PERCENT, FIXED, and FREE_SHIPPING coupons apply correctly at cart (09) and checkout (10); PERCENT respects its max-discount cap.
- [ ] Usage limit, per-customer limit, minimum order, active flag, and start/expiry window are all enforced, with a specific `reason` returned on rejection.
- [ ] Concurrent order confirmations cannot exceed a coupon's usage limit (redemption recorded atomically in the confirmation transaction).
- [ ] An automatic cart-rule discount applies with no code, following the documented stacking precedence.
- [ ] Scheduled sale pricing activates/deactivates by date; product reads expose effective + compare-at price for a "Sale" badge.
- [ ] Admin REST endpoints CRUD coupons/automatic-discounts/sales and are rejected (403) for non-admin tokens; each mutation writes an audit log.
- [ ] `admin_client` can create/edit a coupon, toggle it active, view its redemptions, manage automatic discounts, and schedule a sale — all via `apiClient` + TanStack Query.
