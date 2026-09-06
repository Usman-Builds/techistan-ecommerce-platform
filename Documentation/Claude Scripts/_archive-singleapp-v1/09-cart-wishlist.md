# 09 — Shopping Cart & Wishlist

**Goal:** A robust cart that works for guests (session cookie) and customers (DB), **merges on login**, validates stock in real time, and supports coupons and wishlist. SRD FR-301–FR-307.

**Prerequisites:** Scripts `04` (auth/session), `07` (catalog).

---

## Tasks

### 1. Cart identity & persistence
- Guest cart keyed by a signed `cartSessionId` cookie; customer cart keyed by `userId`. Both persist in the `Cart`/`CartItem` tables (FR-301).
- **Merge on login**: when a guest with a cart signs in, merge guest cart into the user cart (sum quantities, cap at stock), then clear the guest cart.
- Guest client mirror via **Zustand** for instant UI, reconciled with server truth.

### 2. tRPC `cart` router
- `get` — returns line items with variant details, unit price, quantity, line subtotal, cart subtotal (FR-302).
- `addItem`, `updateQuantity`, `removeItem`, `clear`.
- **Real-time stock validation** (FR-303): reject/clamp quantities exceeding available stock; return per-line availability so UI can flag issues before checkout.

### 3. Coupons at cart level (FR-304)
- `applyCoupon` / `removeCoupon` — validate code (exists, active, within dates, min order, usage limits) and return computed discount + validation feedback. (Full coupon engine in script `12`; here call its validator.)

### 4. Estimated shipping (FR-305, Should)
- `estimateShipping(address)` — compute from store shipping zones (StoreSetting). Display estimate in cart.

### 5. Wishlist (FR-307, Should)
- `wishlist` router: `add`, `remove`, `list`, `moveToCart`. Customer-only (`protectedProcedure`). Unique per user+product.

### 6. Abandoned cart hook (FR-306, Should)
- Mark carts idle; leave a scheduled job stub (`markAbandonedCarts`) + email trigger points (after 1h, 24h) — actual sending wired in script `16`.

### 7. UI
- `src/components/storefront/CartDrawer.tsx` (slide-over) + `/cart` page: line items, quantity steppers, remove, coupon input with feedback, subtotal, estimated shipping, "Proceed to checkout" CTA. Full styling in script `14`; deliver functional versions here.

---

## Acceptance criteria
- [ ] Guest can add to cart; after login the guest cart merges into the account cart (quantities summed, stock-capped).
- [ ] Quantity cannot exceed available stock; UI surfaces stock issues.
- [ ] Applying a valid coupon shows the discount; invalid codes show clear feedback.
- [ ] Wishlist add/remove/move-to-cart works for logged-in customers.
- [ ] Cart subtotal + estimated shipping compute correctly.
