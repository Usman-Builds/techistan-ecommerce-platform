# 10 — Checkout & Payments (Stripe)

**Goal:** Multi-step checkout (Shipping → Payment → Review → Confirmation) with **idempotent** order creation, Stripe payment via **PaymentIntents**, server-side tax/shipping calculation, webhook-driven confirmation, and refunds. Guest checkout supported. Backend logic lives in NestJS `order` and `payment` modules (REST + a raw-body webhook route); the `user_client` gets the multi-step checkout flow using **Stripe.js / Elements**. SRD FR-401–FR-415, NFR-207.

**Prerequisites:** Scripts `09` (cart + coupon hook), `03`/`07` (order + product schema). Stripe test keys in the **backend** `.env` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) and the publishable key in the `user_client` (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`). Extend `src/config/validation.ts` (Joi) + `configuration.ts` for the two backend Stripe vars.

> ⚠️ **NEVER store raw card data (NFR-207).** Card details are collected only by **Stripe.js / Elements** in the browser and sent directly to Stripe; our server sees only a PaymentIntent `clientSecret` and Stripe IDs. No PAN/CVV ever touches the backend or DB.
>
> ⚠️ **Architecture reminder (`00-BUILD-ORDER.md`):** one NestJS backend, REST, typed `apiClient` (`credentials: "include"`), Passport JWT (httpOnly cookie), RBAC via `RolesGuard` + `@Roles`, money as **integer cents**, npm. No tRPC, no Next.js API routes as backend.
>
> ⚠️ **Next.js 16 (`00 §7`):** before writing ANY `user_client` code, `npm install`, then read `node_modules/next/dist/docs/` for the relevant APIs (routing, client components, env, metadata). Do not assume older Next conventions.

---

## Tasks

### 1. [Backend] Stripe SDK provider
- Add the Stripe Node SDK. `src/modules/payment/stripe.provider.ts` (or a small `StripeService`) instantiates a single Stripe client from `STRIPE_SECRET_KEY` via `@nestjs/config`. All Stripe calls go through the backend; the client never uses the secret key.

### 2. [Backend] Server-side totals calculation
- In an `order` (or shared `pricing`) service compute, from the cart + shipping address, all money **server-side in cents** (never trust client totals):
  - `calculateShipping(address, cart)` — from store shipping zones in `StoreSetting`.
  - `calculateTax(address, cart)` — destination-based via tax rules in `StoreSetting` (TaxJar optional later — FR-405).
  - `subtotal`, `discount` (re-validate coupon via `CouponService` from script `12`), `shipping`, `tax`, `total`.
- This recompute is authoritative and re-runs at order creation regardless of what the review step displayed (FR-404).

### 3. [Backend] Order module — idempotent `createOrder` (FR-406)
- Generate `src/modules/order/` (`OrderModule`, `OrderController`, `OrderService`, DTOs). Import `PrismaModule`, `CartModule`, `PaymentModule`.
- `POST /orders` (`CreateOrderDto`) — accepts an **idempotency key** (header or body, class-validated):
  - If an order already exists for that key, **return it** (no duplicate) — deduplication is the point.
  - Re-validate stock (from cart), coupon, and recompute totals (Task 2) inside a Prisma transaction.
  - Create `Order` (status `PENDING`) + `OrderItem` snapshots (title, variant, unit price in cents at purchase time) + a pending `Payment` row.
  - Delegate to the payment module to create a Stripe **PaymentIntent** (Task 4) and return `{ order, clientSecret }`.
- **Stock is decremented on payment success (in the webhook), not at order creation.** Guest checkout allowed (order carries a nullable `userId` + captured email).

### 4. [Backend] Payment module — PaymentIntents
- Generate `src/modules/payment/` (`PaymentModule`, `PaymentController`, `PaymentService`, DTOs).
- `PaymentService.createIntent(order)` — create a Stripe PaymentIntent with `amount` (cents), `currency` (from `StoreSetting`, default USD), `metadata.orderId`, and the request idempotency key passed to Stripe. Persist `paymentIntentId` on the `Payment` row; return `clientSecret`.
- Automatic payment methods enabled (cards, Apple Pay, Google Pay via the Payment Element — FR-410).

### 5. [Backend] Stripe webhook — raw-body NestJS route (FR-414)
- `POST /payments/webhook` on `PaymentController`. **Signature verification requires the raw request body**, so this one route must receive the unparsed body:
  - In `main.ts`, apply `express.raw({ type: 'application/json' })` scoped to `/payments/webhook` (or use `rawBody: true` in `NestFactory.create` + `req.rawBody`) **before** the global JSON body parser consumes it.
  - Verify the signature with `STRIPE_WEBHOOK_SECRET` (`stripe.webhooks.constructEvent`); reject on failure.
- Handle events **idempotently** (ignore already-processed event IDs):
  - `payment_intent.succeeded` → mark `Payment` paid, `Order` → `CONFIRMED`, **decrement stock** (transactional), record coupon redemption, fire the order-confirmation email hook (script `16`).
  - `payment_intent.payment_failed` → mark `Payment`/`Order` failed and surface a recovery path.
- No polling; the webhook is the source of truth for payment state.

### 6. [Backend] Refunds (FR-413)
- `PaymentService.processRefund(orderId, amountCents?)` — full or partial refund via Stripe (`stripe.refunds.create`); update `Payment`/`Order` status (`REFUNDED`/partially refunded) and write an audit entry.
- Expose as an **admin-guarded** endpoint (`@Roles('ADMIN','SUPER_ADMIN')` + `RolesGuard`); the admin UI trigger lands in scripts `11`/`15`.

### 7. [Backend] Currency & money formatting (FR-415)
- Primary currency from `StoreSetting` (default USD). Provide a shared `formatMoney(cents, currency)` helper (backend for emails/PDF; the client mirrors it — Task 11). Money is integer cents everywhere.

### 8. [user_client] Stripe.js setup
- `npm install` first, then read `node_modules/next/dist/docs/` (client components, env access) before writing.
- Install `@stripe/stripe-js` + `@stripe/react-stripe-js`. Load Stripe with `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Wrap the payment step in `<Elements>` with the `clientSecret` from `POST /orders`.

### 9. [user_client] Multi-step checkout flow (FR-401)
- `src/app/checkout/` with steps (client-side stepper or nested routes — follow Next 16 routing docs):
  1. **Shipping** — address form; saved addresses for logged-in customers, free entry for guests (FR-402). Optional Google Places autocomplete behind a flag (FR-403, Should).
  2. **Payment** — Stripe **Payment Element** (cards, Apple Pay, Google Pay — FR-410).
  3. **Review** — itemized summary (subtotal, shipping, tax, discounts, total) from the **server-computed** totals, not client math (FR-404).
  4. **Confirmation** — thank-you + order number + summary.
- Persistent order-summary sidebar across steps. On submit, call `POST /orders` with a generated **idempotency key** (stable per checkout attempt), then confirm the PaymentIntent client-side with Stripe.js.

### 10. [user_client] Data layer
- Add checkout/order calls to the typed `apiClient` (`credentials: "include"`) + TanStack Query hooks (`useCreateOrder`, `useShippingEstimate`). After Stripe confirmation, the order is finalized by the backend webhook — poll `GET /orders/:id` or the confirmation endpoint for `CONFIRMED` status rather than trusting the client redirect alone.

### 11. [user_client] Currency formatting
- `src/lib/utils/money.ts` — `formatMoney(cents, currency)` mirroring the backend helper. All displayed prices derive from cents.

---

## Acceptance criteria
- [ ] Guest and logged-in users can complete checkout with a Stripe **test card** end-to-end.
- [ ] Order totals (subtotal/shipping/tax/discount/total) are computed **server-side in cents** and match the review step.
- [ ] Submitting the same checkout twice (same idempotency key) yields **one** order.
- [ ] `payment_intent.succeeded` webhook (verified via raw body + `STRIPE_WEBHOOK_SECRET`) confirms the order and decrements stock; the failure path is handled; duplicate events are ignored.
- [ ] **No card data** passes through the backend or DB — only the PaymentIntent `clientSecret` and Stripe IDs.
- [ ] Full and partial refunds work from the admin-guarded endpoint.
- [ ] Backend boots on `:3000` and the `user_client` checkout runs on `:3001`; Joi validates the Stripe env vars.
