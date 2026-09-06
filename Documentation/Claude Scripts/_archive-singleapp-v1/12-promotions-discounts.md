# 12 — Promotions & Discounts

**Goal:** Coupon engine (percentage/fixed/free-shipping) with limits and expiry, automatic cart-rule discounts, and scheduled sale pricing. SRD FR-601–FR-605.

**Prerequisites:** Scripts `09` (cart applies coupons), `10` (checkout consumes them).

---

## Tasks

### 1. Coupon engine (FR-601, FR-602)
- `src/server/services/discount.service.ts`: single `validateAndApply(code, cart, user)` returning `{ valid, discountCents, reason }`.
- Types: **PERCENT**, **FIXED**, **FREE_SHIPPING**.
- Constraints enforced: usage limit (total), **per-customer** limit, minimum order, start/expiry dates, active flag.
- Record `CouponRedemption` at order confirmation (in the Stripe webhook path); enforce limits atomically to avoid race conditions.

### 2. Automatic discounts (FR-603, Should)
- Rule-based (JSON), e.g. "Buy 3, get 10% off". Evaluate against the cart automatically (no code needed). Support stacking rules with clear precedence (document it).

### 3. Sale pricing (FR-604, Should)
- Scheduled start/end on product/variant sale price. During an active window, `compareAtPrice` shows original and the sale price applies. Storefront badges "Sale".

### 4. Admin management (FR-806)
- tRPC `couponsAdmin` (`adminProcedure`): CRUD coupons, toggle active, view redemptions.
- Admin UI `app/(admin)/admin/coupons/` — list, create/edit form (type, value, limits, dates), status. (Polished in script `15`.)

### 5. Analytics hooks (FR-605, Could)
- Track per-coupon: redemption count, revenue attributed, AOV impact — expose in analytics (script `15`). Leave computed query stubs.

---

## Acceptance criteria
- [ ] Percentage, fixed, and free-shipping coupons apply correctly at cart + checkout.
- [ ] Usage limits, per-customer limits, min order, and expiry are all enforced (including under concurrent redemption).
- [ ] An automatic cart-rule discount applies without a code.
- [ ] Scheduled sale pricing activates/deactivates by date and shows compare-at pricing.
- [ ] Admin can CRUD coupons and view redemption counts.
