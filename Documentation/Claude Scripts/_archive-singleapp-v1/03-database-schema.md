# 03 — Database Schema (Prisma + PostgreSQL)

**Goal:** Define the full relational data model in Prisma, run the first migration, set up the Prisma client singleton, and scaffold the seed script. Based on SRD §6.

**Prerequisites:** Scripts `01`–`02` complete. A PostgreSQL 16 database reachable via `DATABASE_URL` (local Docker or Neon/Supabase). If none exists, add a `docker-compose.yml` with Postgres + Redis (Redis used later for rate limiting/cache).

---

## Tasks

### 1. Prisma init
- `prisma/schema.prisma` with `provider = "postgresql"`, `previewFeatures` as needed.
- Prisma client singleton at `src/server/db.ts` (guard against hot-reload duplicate clients).

### 2. Models
Implement all SRD §6.1 entities plus Auth.js tables. Use **Int cents** for money, `cuid()`/`uuid()` ids, `createdAt`/`updatedAt` on all.

**Auth / users**
- `User` — id, email (unique), name, `passwordHash?` (null for OAuth-only), `role` (enum `Role`), `emailVerified?`, `image?`, `phone?`, `status` (enum: ACTIVE/BANNED), timestamps.
- `Role` enum: `CUSTOMER`, `ADMIN`, `SUPER_ADMIN`.
- Auth.js: `Account`, `Session`, `VerificationToken` (Prisma adapter schema).
- `Address` — userId, label, street, city, state, zip, country, isDefault (max 10 enforced in app layer).

**Catalog**
- `Product` — title, slug (unique), description (rich text/markdown), status (enum: DRAFT/ACTIVE/ARCHIVED), categoryId, seo fields (metaTitle, metaDescription, ogImage, canonicalUrl), timestamps. Indexes: `(slug) unique`, `(categoryId, status)`, `(status, createdAt desc)`.
- `ProductVariant` — productId, sku (unique), price (cents), compareAtPrice (cents?), stock, weight, barcode?, `options` (JSON: e.g. `{Size:"M",Color:"Red"}`). Index `(productId)`.
- `ProductImage` — productId, cloudinaryPublicId, url, alt, position (for drag-reorder), width, height.
- `Category` — name, slug (unique), parentId (self-relation, max 3 levels enforced in app), image?, sortOrder. 
- `Tag` + `ProductTag` join (many-to-many) for cross-cutting taxonomy.
- Optional `Brand` model if faceting by brand (FR-221).

**Cart / wishlist**
- `Cart` — userId? (nullable), sessionId?, expiresAt. Has many `CartItem`.
- `CartItem` — cartId, variantId, quantity.
- `WishlistItem` — userId, productId (unique per user+product).

**Orders / payments**
- `Order` — orderNumber (unique, `ORD-YYYYMMDD-XXXX`), userId?, email, status (enum `OrderStatus`), subtotal, shippingTotal, taxTotal, discountTotal, grandTotal (all cents), currency, shippingAddress (JSON), billingAddress (JSON), couponCode?, notes relation, idempotencyKey (unique). Indexes: `(orderNumber) unique`, `(userId, createdAt desc)`, `(status)`.
- `OrderStatus` enum: `PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, COMPLETED, CANCELLED, REFUNDED`.
- `OrderItem` — orderId, variantId, productTitle (snapshot), variantOptions (JSON snapshot), quantity, unitPrice, total.
- `Payment` — orderId, stripePaymentIntentId, amount, currency, status (enum), method.
- `ShipmentEvent` — orderId, status, carrier?, trackingNumber?, trackingUrl?, note?, occurredAt.
- `OrderNote` — orderId, authorId?, body, visibility (enum: INTERNAL/CUSTOMER).
- `ReturnRequest` — orderId, reasonCode, status (enum: REQUESTED/APPROVED/REJECTED/COMPLETED), note?.

**Promotions**
- `Coupon` — code (unique), type (enum: PERCENT/FIXED/FREE_SHIPPING), value, minOrder?, usageLimit?, perCustomerLimit?, startsAt?, expiresAt?, active. 
- `CouponRedemption` — couponId, userId?, orderId.
- `AutomaticDiscount` — name, rule (JSON, e.g. buy-X-get-Y), active, schedule.

**Reviews**
- `Review` — productId, userId, orderId? (verify purchase), rating (1–5), title, body, status (enum: PENDING/APPROVED/REJECTED), helpfulCount. Photos via `ReviewImage`. Indexes `(productId, status)`, `(userId)`.

**Ops / settings**
- `StoreSetting` — singleton row: name, logoPublicId, contactEmail, currency, taxRules (JSON), shippingZones (JSON), socials (JSON).
- `AuditLog` — actorId, action, entityType, entityId, metadata (JSON), createdAt (FR-808).
- `Notification` — userId, type, title, body, readAt?, data (JSON) — for in-app center.

### 3. Migration & generate
- `prisma migrate dev --name init`
- `prisma generate`

### 4. Seed scaffold — `prisma/seed.ts`
Set up `tsx`-run seed with structure for: store settings singleton, a category tree, sample products+variants+images, and a placeholder for the admin user (actual admin seeding implemented in script `05`). Wire `prisma.seed` in `package.json`.

---

## Acceptance criteria
- [ ] `prisma migrate dev` succeeds; tables created.
- [ ] `src/server/db.ts` exports a singleton `prisma`.
- [ ] `pnpm prisma db seed` runs and inserts store settings + sample catalog.
- [ ] All money fields are integer cents; all listed unique indexes present.
- [ ] `pnpm typecheck` passes with generated Prisma types.
