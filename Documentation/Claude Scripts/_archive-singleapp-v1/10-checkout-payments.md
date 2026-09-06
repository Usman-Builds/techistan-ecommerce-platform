# 10 — Checkout & Payments (Stripe)

**Goal:** Multi-step checkout (Shipping → Payment → Review → Confirmation), Stripe payment via PaymentIntents, tax/shipping calculation, idempotent order creation, and webhook-driven confirmation. Guest checkout supported. SRD FR-401–FR-415, NFR-207.

**Prerequisites:** Scripts `09` (cart), `03` (orders schema). Stripe test keys in `.env` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).

---

## Tasks

### 1. Stripe client
- `src/lib/stripe.ts` server SDK instance. Client uses **Stripe.js / Elements** only — **no raw card data touches our server** (FR-412, NFR-207).

### 2. Checkout flow (multi-step — FR-401)
`app/(storefront)/checkout/` steps:
1. **Shipping** — address form (saved addresses for customers; free entry for guests — FR-402). Optional Google Places autocomplete (FR-403, Should — behind a flag).
2. **Payment** — Stripe Payment Element (cards, Apple Pay, Google Pay — FR-410).
3. **Review** — itemized order summary: subtotal, shipping, tax, discounts, total (FR-404).
4. **Confirmation** — thank-you + order number + summary.
- Persistent order-summary sidebar across steps.

### 3. Calculations
- `calculateShipping(address, cart)` — from store shipping zones.
- `calculateTax(address, cart)` — destination-based via rules in StoreSetting (TaxJar optional later — FR-405). Money in cents throughout.
- Recompute totals **server-side** at order creation (never trust client totals).

### 4. Order creation (idempotent — FR-406)
- tRPC `checkout.createOrder`:
  - Accept an **idempotency key**; if an order with that key exists, return it (prevents duplicates).
  - Re-validate stock + coupon + totals server-side.
  - Create `Order` (status `PENDING`) + `OrderItem` snapshots + `Payment` (pending).
  - Create a Stripe **PaymentIntent** (amount in cents, currency from settings) with the idempotency key; return `clientSecret`.
- Decrement stock on payment success (in webhook), not before.

### 5. Webhooks (FR-414 — no polling)
- `app/api/webhooks/stripe/route.ts`: verify signature with `STRIPE_WEBHOOK_SECRET`; handle `payment_intent.succeeded` (mark Payment paid, Order `CONFIRMED`, decrement stock, record coupon redemption, trigger confirmation email hook), `payment_intent.payment_failed` (mark failed, surface recovery). Idempotent handler (ignore duplicate events).

### 6. Refunds (FR-413)
- Admin action `processRefund(orderId, amount?)` — full or partial via Stripe; update Payment/Order status. (Admin UI in script `15`.)

### 7. Currency (FR-415)
- Primary currency from StoreSetting (default USD); central money formatter `formatMoney(cents, currency)`.

---

## Acceptance criteria
- [ ] Guest and logged-in users can complete checkout with a Stripe **test card** end-to-end.
- [ ] Order totals (subtotal/shipping/tax/discount/total) computed server-side and match the review step.
- [ ] Submitting the same checkout twice (same idempotency key) yields **one** order.
- [ ] `payment_intent.succeeded` webhook confirms the order and decrements stock; failure path is handled.
- [ ] No card data passes through our server (verify only PaymentIntent client secret is used).
- [ ] Partial + full refunds work from an admin call.
