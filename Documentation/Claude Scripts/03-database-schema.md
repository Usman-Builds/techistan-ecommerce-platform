# 03 — Database Schema & Prisma

**Goal:** Extend the existing NestJS/Prisma data model from a single `User` table into the full ShopForge relational schema — all catalog, cart, order, payment, promotion, review, and ops entities — then run the first real migration and scaffold the seed. After this script the backend owns every domain table, `User` carries a `role`, and `prisma/seed.ts` is ready for the admin preseed wired up in script `05`.

**Prerequisites:** Scripts `01`–`02` complete. Backend runs on `:3000` with `@prisma/client` (Prisma 6) already installed and `PrismaModule`/`PrismaService` in place (`src/prisma/`). Local PostgreSQL reachable at the existing `DATABASE_URL` (database **`ecom`**, e.g. `postgresql://postgres:260603@localhost/ecom?schema=public`). All commands run from `Code/backend`.

> ⚠️ **This backend uses Prisma migrations, not Auth.js.** Auth is Passport/NestJS (local + Google + JWT). There are **no** Auth.js adapter tables (`Account`, `Session`, `VerificationToken`). Verification and password-reset tokens are backend-owned models defined below.
>
> ⚠️ **Extend, don't replace.** The existing `User` model backs the working auth flow. Add fields to it; do not redefine it from scratch or change its id type.

---

## ID & money conventions (read first, applied throughout)

- **`User` stays `Int @id @default(autoincrement())`.** Rationale: the existing auth code (JWT `sub`, Passport strategies, `user` module) already depends on integer user ids — migrating to a string id would break working code for no domain benefit.
- **All new domain entities use `String @id @default(cuid())`.** Rationale: cuids are collision-safe, non-enumerable in URLs/APIs, and portable across environments (imports, seeds, distributed writes) — the right default for catalog/order data.
- **Foreign keys to `User` are `Int`** (matching `User.id`); foreign keys between new entities are `String` (cuid).
- **All money is `Int` (integer minor units / cents).** No floats, no `Decimal`, for any price, total, or amount. Currency stored alongside as an ISO-4217 string (default `USD`).
- Every model has `createdAt @default(now())` and, where it can change, `updatedAt @updatedAt`.
- JSON is used for denormalized snapshots and flexible config (address snapshots, variant option snapshots, tax/shipping rules, discount rules, notification payloads).

---

## Tasks

### 1. Datasource, generator & enums
- Confirm `prisma/schema.prisma` has the Postgres datasource and client generator (already present from the existing setup). Add the new enums: `Role`, `UserStatus`, `ProductStatus`, `OrderStatus`, `PaymentStatus`, `CouponType`, `DiscountStatus`, `ReviewStatus`, `OrderNoteVisibility`, `ReturnStatus`, `AddressType`, plus the existing `AuthProvider`.

### 2. Extend `User`
- Add `role Role @default(CUSTOMER)`, `status UserStatus @default(ACTIVE)`, and `emailVerified DateTime?` (null until the customer verifies; script `04` sets it). Keep every existing field and its type unchanged.
- Add the back-relations to the new owned entities (addresses, orders, carts, wishlist, reviews, tokens, notifications, audit logs).

### 3. Auth-owned token models (replace Auth.js tables)
- Add backend-owned `EmailVerificationToken` and `PasswordResetToken` models (scoped to a `User`, hashed token, `expiresAt`, single-use via `usedAt`). Script `04` issues/consumes them; script `05` does not need them for admin preseed.

### 4. Domain models
Implement every entity in the schema below: catalog (`Product`, `ProductVariant`, `ProductImage`, `Category`, `Tag`, `ProductTag`, `Brand`), cart/wishlist (`Cart`, `CartItem`, `WishlistItem`), orders/payments (`Order`, `OrderItem`, `Payment`, `ShipmentEvent`, `OrderNote`, `ReturnRequest`), promotions (`Coupon`, `CouponRedemption`, `AutomaticDiscount`), reviews (`Review`, `ReviewImage`), and ops (`StoreSetting`, `AuditLog`, `Notification`). Preserve all indexes and unique constraints noted inline.

### 5. Migrate & generate
- `npx prisma migrate dev --name add-ecommerce-schema` (creates the migration and applies it to `ecom`).
- `npx prisma generate` (regenerate the typed client for `@prisma/client`).
- If Prisma warns about the existing `User` table, this is expected — the migration is additive (new columns have defaults / are nullable) plus new tables; review the generated SQL before confirming.

### 6. Seed scaffold — `prisma/seed.ts`
- Create `prisma/seed.ts` (run via `tsx`/`ts-node`) structured for: the `StoreSetting` singleton, a small `Category` tree, a couple of `Product`s with `ProductVariant`s + `ProductImage`s, and a **placeholder** admin block. **Do not** implement admin creation here — script `05`'s `seedAdmin()` reads `ADMIN_EMAIL`/`ADMIN_PASSWORD` and owns that. Leave a clearly-marked TODO the admin script fills in.
- Wire the seed in `package.json`:
  ```json
  "prisma": { "seed": "tsx prisma/seed.ts" }
  ```
  (Add `tsx` as a dev dependency if not present.) Seed is idempotent — use `upsert` keyed on unique fields so re-running is safe.

---

## Prisma schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────── Enums ───────────────────────────

enum AuthProvider {
  LOCAL
  GOOGLE
}

enum Role {
  CUSTOMER
  ADMIN
  SUPER_ADMIN
}

enum UserStatus {
  ACTIVE
  BANNED
}

enum AddressType {
  SHIPPING
  BILLING
}

enum ProductStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

enum OrderStatus {
  PENDING
  CONFIRMED
  PROCESSING
  SHIPPED
  DELIVERED
  COMPLETED
  CANCELLED
  REFUNDED
}

enum PaymentStatus {
  REQUIRES_PAYMENT
  PROCESSING
  SUCCEEDED
  FAILED
  REFUNDED
  PARTIALLY_REFUNDED
}

enum CouponType {
  PERCENT
  FIXED
  FREE_SHIPPING
}

enum DiscountStatus {
  ACTIVE
  SCHEDULED
  DISABLED
}

enum ReviewStatus {
  PENDING
  APPROVED
  REJECTED
}

enum OrderNoteVisibility {
  INTERNAL
  CUSTOMER
}

enum ReturnStatus {
  REQUESTED
  APPROVED
  REJECTED
  COMPLETED
}

// ─────────────────────────── Auth / Users ───────────────────────────
// User keeps Int autoincrement id (existing auth code depends on it).

model User {
  id           Int          @id @default(autoincrement())
  firstName    String
  lastName     String
  email        String       @unique
  phoneNumber  String?      @unique
  profilePhoto String?
  gender       String?
  dateOfBirth  DateTime?
  password     String? // nullable for Google users
  googleId     String?      @unique
  provider     AuthProvider @default(LOCAL)
  refreshToken String?

  // added in this script
  role          Role       @default(CUSTOMER)
  status        UserStatus @default(ACTIVE)
  emailVerified DateTime? // set by script 04 verification flow

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // relations
  addresses           Address[]
  carts               Cart[]
  wishlistItems       WishlistItem[]
  orders              Order[]
  reviews             Review[]
  orderNotes          OrderNote[]
  couponRedemptions   CouponRedemption[]
  notifications       Notification[]
  auditLogs           AuditLog[]
  emailVerifyTokens   EmailVerificationToken[]
  passwordResetTokens PasswordResetToken[]

  @@index([role])
}

model EmailVerificationToken {
  id        String    @id @default(cuid())
  userId    Int
  tokenHash String    @unique // store a hash, never the raw token
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    Int
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Address {
  id         String      @id @default(cuid())
  userId     Int
  type       AddressType @default(SHIPPING)
  label      String? // "Home", "Work"
  fullName   String
  phone      String?
  line1      String
  line2      String?
  city       String
  state      String
  postalCode String
  country    String      @default("US")
  isDefault  Boolean     @default(false)
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

// ─────────────────────────── Catalog ───────────────────────────

model Category {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  parentId  String? // self-relation; max 3 levels enforced in app layer
  imageId   String? // Cloudinary publicId
  imageUrl  String?
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id], onDelete: SetNull)
  children Category[] @relation("CategoryTree")
  products Product[]

  @@index([parentId])
}

model Brand {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  logoUrl   String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  products  Product[]
}

model Product {
  id          String        @id @default(cuid())
  title       String
  slug        String        @unique
  description String? // markdown / rich text
  status      ProductStatus @default(DRAFT)
  categoryId  String?
  brandId     String?

  // SEO
  metaTitle       String?
  metaDescription String?
  ogImage         String?
  canonicalUrl    String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  category     Category?        @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  brand        Brand?           @relation(fields: [brandId], references: [id], onDelete: SetNull)
  variants     ProductVariant[]
  images       ProductImage[]
  productTags  ProductTag[]
  reviews      Review[]
  wishlistedBy WishlistItem[]

  @@index([categoryId, status])
  @@index([status, createdAt])
  @@index([brandId])
}

model ProductVariant {
  id             String   @id @default(cuid())
  productId      String
  sku            String   @unique
  price          Int // cents
  compareAtPrice Int? // cents
  stock          Int      @default(0)
  weightGrams    Int? // integer grams (avoid floats)
  barcode        String?
  options        Json // e.g. { "Size": "M", "Color": "Red" }
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  product    Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  cartItems  CartItem[]
  orderItems OrderItem[]

  @@index([productId])
}

model ProductImage {
  id                 String   @id @default(cuid())
  productId          String
  cloudinaryPublicId String
  url                String
  alt                String?
  position           Int      @default(0) // drag-reorder
  width              Int?
  height             Int?
  createdAt          DateTime @default(now())

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId, position])
}

model Tag {
  id          String       @id @default(cuid())
  name        String
  slug        String       @unique
  productTags ProductTag[]
}

model ProductTag {
  productId String
  tagId     String

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  tag     Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([productId, tagId])
  @@index([tagId])
}

// ─────────────────────────── Cart / Wishlist ───────────────────────────

model Cart {
  id        String    @id @default(cuid())
  userId    Int? // null for guest carts
  sessionId String? // guest identifier (merged into user cart on login)
  expiresAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  user  User?      @relation(fields: [userId], references: [id], onDelete: Cascade)
  items CartItem[]

  @@index([userId])
  @@index([sessionId])
}

model CartItem {
  id        String   @id @default(cuid())
  cartId    String
  variantId String
  quantity  Int      @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  cart    Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variant ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@unique([cartId, variantId])
  @@index([cartId])
}

model WishlistItem {
  id        String   @id @default(cuid())
  userId    Int
  productId String
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([userId, productId])
  @@index([userId])
}

// ─────────────────────────── Orders / Payments ───────────────────────────

model Order {
  id          String      @id @default(cuid())
  orderNumber String      @unique // ORD-YYYYMMDD-XXXX
  userId      Int? // null for guest checkout
  email       String
  status      OrderStatus @default(PENDING)

  // money — all cents
  subtotal      Int
  shippingTotal Int    @default(0)
  taxTotal      Int    @default(0)
  discountTotal Int    @default(0)
  grandTotal    Int
  currency      String @default("USD")

  shippingAddress Json // snapshot at time of order
  billingAddress  Json
  couponCode      String?
  idempotencyKey  String? @unique // dedupe checkout submissions

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user           User?              @relation(fields: [userId], references: [id], onDelete: SetNull)
  items          OrderItem[]
  payments       Payment[]
  shipmentEvents ShipmentEvent[]
  notes          OrderNote[]
  returnRequests ReturnRequest[]
  redemptions    CouponRedemption[]
  reviews        Review[]

  @@index([userId, createdAt])
  @@index([status])
}

model OrderItem {
  id             String  @id @default(cuid())
  orderId        String
  variantId      String?
  productTitle   String // snapshot
  variantOptions Json // snapshot, e.g. { "Size": "M" }
  sku            String
  quantity       Int
  unitPrice      Int // cents
  total          Int // cents

  order   Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variant ProductVariant? @relation(fields: [variantId], references: [id], onDelete: SetNull)

  @@index([orderId])
}

model Payment {
  id                    String        @id @default(cuid())
  orderId               String
  stripePaymentIntentId String?       @unique
  amount                Int // cents
  currency              String        @default("USD")
  status                PaymentStatus @default(REQUIRES_PAYMENT)
  method                String? // "card", etc.
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
}

model ShipmentEvent {
  id             String   @id @default(cuid())
  orderId        String
  status         String
  carrier        String?
  trackingNumber String?
  trackingUrl    String?
  note           String?
  occurredAt     DateTime @default(now())

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
}

model OrderNote {
  id         String              @id @default(cuid())
  orderId    String
  authorId   Int?
  body       String
  visibility OrderNoteVisibility @default(INTERNAL)
  createdAt  DateTime            @default(now())

  order  Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  author User? @relation(fields: [authorId], references: [id], onDelete: SetNull)

  @@index([orderId])
}

model ReturnRequest {
  id         String       @id @default(cuid())
  orderId    String
  reasonCode String
  status     ReturnStatus @default(REQUESTED)
  note       String?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
}

// ─────────────────────────── Promotions ───────────────────────────

model Coupon {
  id               String     @id @default(cuid())
  code             String     @unique
  type             CouponType
  value            Int // percent (0-100) or fixed cents; ignored for FREE_SHIPPING
  minOrder         Int? // cents
  usageLimit       Int?
  perCustomerLimit Int?
  startsAt         DateTime?
  expiresAt        DateTime?
  active           Boolean    @default(true)
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  redemptions CouponRedemption[]

  @@index([active])
}

model CouponRedemption {
  id        String   @id @default(cuid())
  couponId  String
  userId    Int?
  orderId   String
  createdAt DateTime @default(now())

  coupon Coupon @relation(fields: [couponId], references: [id], onDelete: Cascade)
  user   User?  @relation(fields: [userId], references: [id], onDelete: SetNull)
  order  Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([couponId])
  @@index([userId])
}

model AutomaticDiscount {
  id        String         @id @default(cuid())
  name      String
  rule      Json // e.g. { "type": "BXGY", "buy": 2, "get": 1 }
  status    DiscountStatus @default(ACTIVE)
  startsAt  DateTime?
  endsAt    DateTime?
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@index([status])
}

// ─────────────────────────── Reviews ───────────────────────────

model Review {
  id           String       @id @default(cuid())
  productId    String
  userId       Int
  orderId      String? // verifies purchase
  rating       Int // 1-5
  title        String?
  body         String?
  status       ReviewStatus @default(PENDING)
  helpfulCount Int          @default(0)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  product Product       @relation(fields: [productId], references: [id], onDelete: Cascade)
  user    User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  order   Order?        @relation(fields: [orderId], references: [id], onDelete: SetNull)
  images  ReviewImage[]

  @@unique([productId, userId]) // one review per user per product
  @@index([productId, status])
  @@index([userId])
}

model ReviewImage {
  id                 String  @id @default(cuid())
  reviewId           String
  cloudinaryPublicId String
  url                String
  alt                String?

  review Review @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  @@index([reviewId])
}

// ─────────────────────────── Ops / Settings ───────────────────────────

model StoreSetting {
  id            String   @id @default(cuid())
  singleton     Boolean  @unique @default(true) // enforces one row
  name          String   @default("ShopForge")
  logoPublicId  String?
  contactEmail  String?
  currency      String   @default("USD")
  taxRules      Json? // { "US": { "rate": 700 } } etc.
  shippingZones Json?
  socials       Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model AuditLog {
  id         String   @id @default(cuid())
  actorId    Int?
  action     String // "product.update", "order.refund", ...
  entityType String
  entityId   String
  metadata   Json?
  createdAt  DateTime @default(now())

  actor User? @relation(fields: [actorId], references: [id], onDelete: SetNull)

  @@index([entityType, entityId])
  @@index([actorId])
}

model Notification {
  id        String    @id @default(cuid())
  userId    Int
  type      String
  title     String
  body      String?
  data      Json?
  readAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt])
}
```

---

## Seed scaffold (`prisma/seed.ts`)

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Store settings singleton
  await prisma.storeSetting.upsert({
    where: { singleton: true },
    update: {},
    create: { singleton: true, name: 'ShopForge', currency: 'USD' },
  });

  // 2. Category tree
  const apparel = await prisma.category.upsert({
    where: { slug: 'apparel' },
    update: {},
    create: { name: 'Apparel', slug: 'apparel', sortOrder: 1 },
  });
  await prisma.category.upsert({
    where: { slug: 'tshirts' },
    update: {},
    create: { name: 'T-Shirts', slug: 'tshirts', parentId: apparel.id, sortOrder: 1 },
  });

  // 3. Sample product + variant
  const product = await prisma.product.upsert({
    where: { slug: 'classic-tee' },
    update: {},
    create: {
      title: 'Classic Tee',
      slug: 'classic-tee',
      description: 'A comfortable everyday t-shirt.',
      status: 'ACTIVE',
      categoryId: apparel.id,
    },
  });
  await prisma.productVariant.upsert({
    where: { sku: 'TEE-M-BLK' },
    update: {},
    create: {
      productId: product.id,
      sku: 'TEE-M-BLK',
      price: 2499, // $24.99 in cents
      stock: 100,
      options: { Size: 'M', Color: 'Black' },
    },
  });

  // 4. Admin user — TODO: implemented in script 05 (seedAdmin reads
  //    ADMIN_EMAIL / ADMIN_PASSWORD -> SUPER_ADMIN). Do NOT create here.
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

---

## Acceptance criteria
- [ ] `npx prisma migrate dev --name add-ecommerce-schema` succeeds; all new tables + enums created in `ecom`, existing `User` data preserved.
- [ ] `User` has `role` (default `CUSTOMER`), `status`, and `emailVerified`; existing fields/types unchanged; id remains `Int @id @default(autoincrement())`.
- [ ] **No** Auth.js tables (`Account`, `Session`, `VerificationToken`); tokens are the backend-owned `EmailVerificationToken` / `PasswordResetToken` models.
- [ ] All new domain entities use `String @id @default(cuid())`; foreign keys to `User` are `Int`.
- [ ] Every money field is `Int` (cents); no `Float`/`Decimal` anywhere.
- [ ] `Role` enum present with `CUSTOMER`, `ADMIN`, `SUPER_ADMIN`.
- [ ] All ecommerce entities present: Address, Product, ProductVariant, ProductImage, Category, Brand, Tag, ProductTag, Cart, CartItem, WishlistItem, Order, OrderItem, Payment, ShipmentEvent, OrderNote, ReturnRequest, Coupon, CouponRedemption, AutomaticDiscount, Review, ReviewImage, StoreSetting, AuditLog, Notification.
- [ ] Unique constraints present: `Product.slug`, `ProductVariant.sku`, `Category.slug`, `Tag.slug`, `Brand.slug`, `Order.orderNumber`, `Order.idempotencyKey`, `Coupon.code`, `Payment.stripePaymentIntentId`, `CartItem(cartId,variantId)`, `WishlistItem(userId,productId)`, `Review(productId,userId)`, token `tokenHash` fields, `StoreSetting.singleton`.
- [ ] `npx prisma generate` regenerates the client; `npm run build` / typecheck passes with the new types.
- [ ] `prisma/seed.ts` exists, is wired via `package.json` `"prisma": { "seed": "tsx prisma/seed.ts" }`, runs idempotently, and inserts store settings + sample catalog. Admin creation is deferred to script `05` (marked TODO).
