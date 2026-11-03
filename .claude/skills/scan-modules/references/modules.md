# Module map

Paths are relative to the repo root. Backend modules live in `Code/backend/src/modules/<key>/`. The integration specs are in `Code/backend/test/*.e2e-spec.ts`, which covers `app`, `auth`, `checkout-idempotency`, `rbac` and `review-gating`.

Modules are listed highest-risk first, which is also the scan order for `all`.

## Money & checkout

### payment
- **Paths:** `modules/payment/`. UI: `Code/frontend/user_client/src/app/checkout/`, `src/components/checkout/`, `src/lib/stripe.ts`
- **Specs:** `payment.service.spec.ts`, `test/checkout-idempotency.e2e-spec.ts`
- **Risks:**
  - Stripe webhook signature verified against the *raw* body
  - Webhook events handled idempotently (replays, out-of-order delivery)
  - Amount is computed server-side and never trusted from the client
  - Currency/cents conversions
  - A payment intent can't be reused across orders
  - Order is marked paid only on a confirmed event
  - Secrets are never logged

### order
- **Paths:** `modules/order/` (incl. `pricing.service.ts`, `order-status.ts`, `invoice.service.ts`, `admin-order.controller.ts`). UI: `user_client/src/app/account/orders/`, `admin_client/src/app/(admin)/orders/`
- **Specs:** `order-number.spec.ts`, `order-status.spec.ts`, `pricing.service.spec.ts`
- **Risks:**
  - Illegal status transitions (e.g. refunded → shipped)
  - Stock is decremented/restored atomically with the order (transaction)
  - Totals = items + shipping + tax − discounts, with no float math
  - A user can read or cancel only their own orders (IDOR)
  - Order number collisions
  - Invoice leaks another customer's data

### coupon
- **Paths:** `modules/coupon/` (incl. `sale-pricing.ts`, promotion admin). UI: `admin_client/src/app/(admin)/coupons/`, `discounts/`, `sales/`
- **Specs:** `coupon.service.spec.ts`, `coupon-limits.spec.ts`
- **Risks:**
  - Global and per-user usage limits under concurrent redemption
  - Expiry/start dates and timezones
  - Min-order threshold measured after or before other discounts
  - Percentage > 100 or negative values
  - Stacking rules
  - Sale price vs. coupon precedence
  - Case sensitivity of codes

### cart
- **Paths:** `modules/cart/`. UI: `user_client/src/app/cart/`, `src/lib/store/`
- **Specs:** `cart-merge.spec.ts`
- **Risks:**
  - Guest → user cart merge (duplicates, quantity clamping to stock)
  - Quantity ≤ 0 or above stock
  - Price is read from the DB at checkout, not from the cart snapshot
  - Deleted or inactive products left in the cart
  - Cart ownership checks

### inventory
- **Paths:** `modules/inventory/`. UI: `admin_client/src/app/(admin)/inventory/`
- **Risks:**
  - Negative stock
  - Race between concurrent orders (lost update)
  - Adjustments are audited
  - Low-stock thresholds
  - Variant vs. product stock

## Identity & access

### auth
- **Paths:** `modules/auth/` (incl. `strategies/`), `Code/backend/src/common/guards/`. UI: `user_client/src/app/(auth)/`, `src/lib/auth/`, `admin_client/src/app/login/`, `src/lib/auth/`, both `src/proxy.ts`
- **Specs:** `test/auth.e2e-spec.ts`, `test/rbac.e2e-spec.ts`
- **Risks:**
  - Refresh-token rotation and reuse detection
  - Logout revokes tokens
  - Cookie flags (httpOnly, secure, sameSite) in production
  - JWT secret/expiry from config
  - Email-verification bypass
  - Password reset tokens are single-use and expire
  - User enumeration through error messages
  - Throttling on login/reset
  - Every `/admin/*` route carries the admin role guard

### user / account / customer / address
- **Paths:** `modules/account/` (incl. `account-deletion.cron.ts`), `modules/customer/`, `modules/address/`. UI: `user_client/src/app/account/`, `admin_client/src/app/(admin)/customers/`
- **Specs:** `test/rbac.e2e-spec.ts` (the legacy `/users` CRUD was removed in #23 and must stay 404)
- **Risks:**
  - IDOR on address/profile ids
  - Password hash or tokens leaked in responses (select/omit)
  - Role escalation through a profile-update DTO (mass assignment)
  - Account deletion fully anonymises or cascades
  - Customer admin endpoints are guarded

(Scan these as four keys: `user`, `account`, `customer`, `address`.)

### common
- **Paths:** `Code/backend/src/common/` (decorators, guards, utils such as `money.util.ts`, `slug.util.ts`), `Code/backend/src/main.ts`, `src/config/`
- **Specs:** `money.util.spec.ts`
- **Risks:**
  - Guard order (JWT before roles)
  - Optional-JWT guard doesn't swallow invalid tokens into an elevated state
  - ValidationPipe `whitelist`/`forbidNonWhitelisted`
  - CORS origin list
  - Money rounding
  - Slug collisions or unicode

## Catalog & content

### product
- **Paths:** `modules/product/`. UI: `user_client/src/app/products/`, `admin_client/src/app/(admin)/products/`, `src/components/products/`
- **Specs:** `product.service.spec.ts`
- **Risks:**
  - Inactive or draft products exposed publicly
  - Variant price/stock consistency
  - Slug uniqueness on update
  - Pagination bounds (take/skip limits)
  - Admin-only fields leaked in the public DTO

### category / tag
- **Paths:** `modules/category/`, `modules/tag/`. UI: `admin_client/src/app/(admin)/categories/`, `user_client/src/app/c/`
- **Risks:**
  - Cyclic parent chains
  - Deleting a category with products or children
  - Slug collisions
  - Hidden categories exposed publicly

(Scan these as two keys: `category`, `tag`.)

### search
- **Paths:** `modules/search/` (incl. `providers/`, `synonyms.ts`). UI: `user_client/src/app/search/`, `src/components/search/`, `src/lib/search-highlight.tsx`
- **Risks:**
  - Raw SQL / `$queryRaw` injection (FTS/trigram queries)
  - Unbounded result sizes
  - Inactive products in results
  - XSS through highlight rendering (`dangerouslySetInnerHTML`)

### review
- **Paths:** `modules/review/`. UI: `user_client/src/components/reviews/`, `admin_client/src/app/(admin)/reviews/`
- **Specs:** `review.service.spec.ts`, `test/review-gating.e2e-spec.ts`
- **Risks:**
  - Verified-purchase gating
  - One review per user per product
  - Rating bounds
  - Average recomputed on moderation or delete
  - Unmoderated reviews shown publicly

### storefront / settings
- **Paths:** `modules/storefront/` (homepage, navigation, showcase), `modules/settings/`. UI: `admin_client/src/app/(admin)/homepage/`, `navigation/`, `settings/`, `user_client/src/app/page.tsx`
- **Specs:** `showcase.service.spec.ts`
- **Risks:**
  - Admin-only writes are guarded
  - Unvalidated JSON blocks breaking the homepage render
  - Public settings endpoint leaking secrets

(Scan these as two keys: `storefront`, `settings`.)

### media
- **Paths:** `modules/media/`. UI: `admin_client/src/app/(admin)/media/`, `src/lib/api/media*.ts`
- **Risks:**
  - Upload file type/size validation
  - Cloudinary signature or secret exposure
  - Orphaned assets on delete
  - Admin-only upload

### wishlist / recently-viewed
- **Paths:** `modules/wishlist/`, `modules/recently-viewed/`. UI: `user_client/src/app/wishlist/`, `src/lib/recently-viewed.ts`
- **Risks:**
  - Ownership checks
  - Duplicates
  - Unbounded list growth
  - Deleted products

(Scan these as two keys: `wishlist`, `recently-viewed`.)

## Ops & back-office

### notification / email
- **Paths:** `modules/notification/` (incl. `notifier.service.ts`, `sms.service.ts`), `modules/email/` (incl. `templates/`). UI: `user_client/src/app/account/notifications/`, `admin_client/src/app/(admin)/notifications/`
- **Risks:**
  - A user can read only their own notifications
  - Email send failure must not fail the order/payment flow
  - HTML injection in templates from user-supplied names
  - Missing `RESEND_API_KEY` handled gracefully

(Scan these as two keys: `notification`, `email`.)

### cron
- **Paths:** `modules/cron/` (incl. `cron-secret.guard.ts`, `abandoned-cart.service.ts`)
- **Risks:**
  - Cron endpoint secret uses a constant-time compare and fails closed when unset
  - Abandoned-cart emails aren't sent twice
  - Jobs are idempotent

### analytics / audit / export
- **Paths:** `modules/analytics/`, `modules/audit/`, `modules/export/`. UI: `admin_client/src/app/(admin)/page.tsx`, `audit-log/`
- **Risks:**
  - Every endpoint is admin-guarded
  - CSV/formula injection in exports (`=`, `+`, `-`, `@` prefixes)
  - Unbounded date ranges or query sizes
  - Audit log can't be edited or deleted

(Scan these as three keys: `analytics`, `audit`, `export`.)

## Frontends (whole-app sweeps)

### storefront-ui
- **Paths:** `Code/frontend/user_client/src/`
- **Specs:** `src/**/*.test.ts(x)` (vitest), `e2e/*.spec.ts` (Playwright)
- **Risks:**
  - Server/client component boundary errors
  - Secrets in `NEXT_PUBLIC_*`
  - Auth redirect loops in `proxy.ts`
  - Unhandled API errors (blank screens)
  - Prices formatted from floats
  - XSS through `dangerouslySetInnerHTML`
  - Accessibility of forms (labels, focus)
  - SEO metadata and canonical URLs

### admin-ui
- **Paths:** `Code/frontend/admin_client/src/`
- **Specs:** `src/**/*.test.ts` (vitest)
- **Risks:**
  - Route protection in `proxy.ts`
  - Form validation matches backend DTOs (`src/lib/validation/`)
  - Optimistic updates not rolled back on error (React Query)
  - Destructive actions without confirmation
  - Money input parsing (cents)
