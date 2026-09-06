# 09 — Shopping Cart & Wishlist

**Goal:** A robust cart that works for guests (cookie-identified) and customers (DB), **merges on login**, validates stock in real time, exposes a coupon-apply hook and estimated shipping, plus a customer wishlist. Backend logic lives in NestJS `cart` and `wishlist` modules (REST); the `user_client` storefront gets a Zustand guest-cart store, a `CartDrawer`, a `/cart` page, and wishlist UI. SRD FR-301–FR-307.

**Prerequisites:** Scripts `04` (customer auth — Passport JWT httpOnly cookie), `05` (roles/RBAC), `07` (catalog: `Product`/`ProductVariant`), `03` (schema — `Cart`, `CartItem`, `Wishlist`, `WishlistItem` tables; add them here if the schema stub is missing and run a Prisma migration). Coupon validation is a **hook** into the `coupon` module (full engine in script `12`); abandoned-cart email sending is wired in script `16`.

> ⚠️ **Architecture reminder (`00-BUILD-ORDER.md`):** one NestJS backend owns all data; the two Next.js clients call it over **REST** with a typed `apiClient` (`fetch`, `credentials: "include"`). No tRPC, no Auth.js, npm only. Money is stored and returned as **integer cents**.
>
> ⚠️ **Next.js 16 (`00 §7`):** before writing ANY `user_client` code, `npm install` in that client, then read the relevant guides under `node_modules/next/dist/docs/` (routing, server/client components, cookies, metadata). Do not assume Next 13/14/15 conventions.

---

## Tasks

### 1. [Backend] Prisma schema — cart & wishlist entities
- Ensure these models exist in `Code/backend/prisma/schema.prisma` (add + migrate if absent):
  - `Cart` — `id`, nullable `userId` (unique when set), nullable `sessionId` (unique when set, for guests), `couponCode` (nullable), timestamps, `updatedAt` (drives abandoned-cart detection), relation `items CartItem[]`.
  - `CartItem` — `id`, `cartId`, `productId`, `variantId`, `quantity`, `unitPriceCents` (snapshot at add time for display; authoritative price re-read from the variant on read), unique on `(cartId, variantId)`.
  - `Wishlist` / `WishlistItem` — `WishlistItem` unique on `(userId, productId)` (customer-only).
- Run `npx prisma migrate dev` then `npx prisma generate`.

### 2. [Backend] Cart module scaffold
- Generate `src/modules/cart/` with `CartModule`, `CartController`, `CartService`, and DTOs under `cart/dto/`. Import `PrismaModule`. Register in `AppModule`.
- All request/response bodies are **DTOs validated by class-validator**; the global `ValidationPipe` (whitelist + transform) already runs. Cents are integers; never floats.

### 3. [Backend] Cart identity & persistence
- **Guest cart:** identified by a signed, httpOnly `cartSessionId` cookie (use the existing `cookie-parser` from script `01`; sign with a config secret). A small resolver (interceptor or helper in `CartService`) reads the cookie; if none exists on a mutating call, create a cart row with a fresh `sessionId` and set the cookie on the response.
- **Customer cart:** identified by `userId` from the JWT (Passport `JwtAuthGuard`, optional-auth variant so guests are allowed). Endpoints work whether or not a user is authenticated.
- Persist both in `Cart`/`CartItem` (FR-301). One active cart per identity.

### 4. [Backend] Cart REST endpoints (`CartController`)
- `GET /cart` — resolve the caller's cart (user or guest cookie); return line items with variant details (title, image, options), unit price (cents), quantity, line subtotal, cart subtotal, applied coupon + discount, item count (FR-302). Prices re-read from the current variant.
- `POST /cart/items` — `{ variantId, quantity }`; add or increment. `PATCH /cart/items/:itemId` — `{ quantity }`. `DELETE /cart/items/:itemId`. `DELETE /cart` — clear.
- **Real-time stock validation (FR-303):** on add/update and on `GET`, clamp quantities to available variant stock; reject if out of stock. Return a per-line `availability` field (`available` count + `clamped`/`outOfStock` flags) so the UI can flag issues before checkout. Never allow quantity > stock to persist.

### 5. [Backend] Merge guest cart on login (FR-301)
- Expose `CartService.mergeGuestCartIntoUser(sessionId, userId)`.
- Call it from the **auth login flow** (scripts `04`/`05`): after a successful login/JWT issue, if the request carries a `cartSessionId` cookie with a guest cart, merge its items into the user's cart — sum quantities per `variantId`, **cap at available stock**, then delete the guest cart and clear the `cartSessionId` cookie.
- Idempotent and safe when the user has no existing cart (adopt the guest cart) or the guest cart is empty (no-op).

### 6. [Backend] Coupon apply hook (FR-304)
- `POST /cart/coupon` — `{ code }`; `DELETE /cart/coupon` — remove.
- Validate by delegating to the `coupon` module's validator service (`CouponService.validate(code, cart)` — exists, active, within start/end dates, min-order met, usage limit not exceeded). Store the accepted `couponCode` on the `Cart`; return computed discount (cents) + clear validation feedback on rejection. **Do not** finalize redemption here — that happens at order/payment success (scripts `10`/`12`).

### 7. [Backend] Estimated shipping (FR-305, Should)
- `POST /cart/estimate-shipping` — `{ address }` (or partial: country/region/postal); compute an estimate from store shipping zones read from `StoreSetting` (from script `03`/`15`). Return amount in cents + zone label. Cheap, non-authoritative preview — the authoritative calc runs at checkout (script `10`).

### 8. [Backend] Wishlist module (FR-307, Should)
- Generate `src/modules/wishlist/` (`WishlistModule`, `WishlistController`, `WishlistService`, DTOs). **Customer-only:** guard every route with `JwtAuthGuard` + `@Roles('CUSTOMER')` via `RolesGuard`.
- `GET /wishlist` — list items with product summary. `POST /wishlist/items` — `{ productId }` (unique per user+product; idempotent). `DELETE /wishlist/items/:productId`. `POST /wishlist/items/:productId/move-to-cart` — add to cart then remove from wishlist.

### 9. [Backend] Abandoned-cart hook (FR-306, Should)
- Add `CartService.markAbandonedCarts()` that finds carts with items and `updatedAt` older than thresholds (e.g. 1h and 24h) and flags them / returns the due set with email trigger points.
- Leave it as a callable method with a stubbed logger; the **scheduled job + actual email send are wired in script `16`** (do not add `@nestjs/schedule` cron here).

### 10. [user_client] Guest cart store (Zustand)
- `npm install` first, then read `node_modules/next/dist/docs/` for client-component + cookies conventions.
- `src/lib/store/cart-store.ts` — Zustand store for **instant guest UI** (line items, add/update/remove, derived subtotal/count), persisted to `localStorage`. Treat it as an optimistic mirror reconciled against server truth from `GET /cart`.
- On login, after auth succeeds, trigger a refetch of the server cart (the backend merge in Task 5 is the source of truth) and clear/replace the local mirror.

### 11. [user_client] API + data layer
- Add cart calls to the typed `apiClient` (`src/lib/api/`, `credentials: "include"`). Wrap them in **TanStack Query** hooks: `useCart`, `useAddToCart`, `useUpdateCartItem`, `useRemoveCartItem`, `useApplyCoupon`, `useEstimateShipping`, and wishlist hooks (`useWishlist`, `useToggleWishlist`, `useMoveToCart`). Use optimistic updates + `invalidateQueries` on the cart key.

### 12. [user_client] Cart & wishlist UI
- `src/components/storefront/CartDrawer.tsx` — slide-over: line items, quantity steppers (respecting stock/availability flags from the API), remove, subtotal, item count, "Proceed to checkout" CTA.
- `src/app/cart/page.tsx` — full `/cart` page: line items, coupon input with success/error feedback, subtotal, estimated-shipping preview, and checkout CTA (checkout flow itself is script `10`).
- Wishlist UI: a wishlist toggle (heart) on product cards/PDP and a `/wishlist` (account) page listing items with "move to cart". Deliver **functional** versions here; polished styling lands in script `14`.

---

## Acceptance criteria
- [ ] A guest can add to cart (cookie-identified); items persist across page reloads.
- [ ] After login the guest cart **merges** into the account cart (quantities summed per variant, stock-capped) and the guest cart/cookie is cleared.
- [ ] Quantity can never exceed available stock; the API returns per-line availability and the UI surfaces stock issues.
- [ ] Applying a valid coupon shows the discount; invalid/expired codes return clear feedback; no redemption is finalized at cart stage.
- [ ] Estimated shipping computes from store zones and displays on the cart page.
- [ ] Wishlist add / remove / move-to-cart works for logged-in customers only (RBAC-guarded; guests get 401/403).
- [ ] `CartService.markAbandonedCarts()` exists and returns due carts (job wiring deferred to script `16`).
- [ ] All cart/wishlist mutations go through class-validator DTOs; money is integer cents end-to-end.
