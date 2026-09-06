-- Script 18 — admin merchandising surface.
--
--   * Category gains presentation (description, banner, icon), SEO and
--     visibility columns, so a category is editable as a real landing page
--     rather than just a name in a tree.
--   * Coupon and AutomaticDiscount gain a PromotionScope plus product/category
--     restriction join tables, so a promotion can target part of the catalog.
--   * HomepageSection / HeroSlide / NavItem make the storefront homepage,
--     header and footer editable content instead of hard-coded JSX.
--   * StoreSetting gains the announcement bar + footer copy.
--
-- Every added column is nullable or defaulted, so this applies to a populated
-- database with no backfill step.

-- ─────────────────────────────── Enums ───────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PromotionScope" AS ENUM ('ALL', 'CATEGORY', 'PRODUCT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "HomeSectionType" AS ENUM (
    'HERO', 'TRUST_BAR', 'CATEGORY_RAIL', 'PRODUCT_RAIL',
    'PROMO_TILES', 'BANNER', 'NEWSLETTER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProductSource" AS ENUM (
    'FEATURED', 'NEWEST', 'ON_SALE', 'BEST_SELLING',
    'TOP_RATED', 'CATEGORY', 'TAG', 'PRICE_UNDER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NavLocation" AS ENUM ('HEADER', 'FOOTER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────────── Category ─────────────────────────────

ALTER TABLE "Category"
  ADD COLUMN IF NOT EXISTS "description"     TEXT,
  ADD COLUMN IF NOT EXISTS "bannerId"        TEXT,
  ADD COLUMN IF NOT EXISTS "bannerUrl"       TEXT,
  ADD COLUMN IF NOT EXISTS "iconKey"         TEXT,
  ADD COLUMN IF NOT EXISTS "metaTitle"       TEXT,
  ADD COLUMN IF NOT EXISTS "metaDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "showInNav"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "featured"        BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Category_isActive_idx" ON "Category" ("isActive");

-- ────────────────────────────── Coupon ──────────────────────────────

ALTER TABLE "Coupon"
  ADD COLUMN IF NOT EXISTS "name"               TEXT,
  ADD COLUMN IF NOT EXISTS "description"        TEXT,
  ADD COLUMN IF NOT EXISTS "scope"              "PromotionScope" NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS "appliesToSaleItems" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "batchId"            TEXT;

CREATE INDEX IF NOT EXISTS "Coupon_batchId_idx" ON "Coupon" ("batchId");
CREATE INDEX IF NOT EXISTS "Coupon_scope_idx"   ON "Coupon" ("scope");

CREATE TABLE IF NOT EXISTS "CouponProduct" (
  "couponId"  TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  CONSTRAINT "CouponProduct_pkey" PRIMARY KEY ("couponId", "productId")
);
CREATE INDEX IF NOT EXISTS "CouponProduct_productId_idx" ON "CouponProduct" ("productId");

CREATE TABLE IF NOT EXISTS "CouponCategory" (
  "couponId"   TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  CONSTRAINT "CouponCategory_pkey" PRIMARY KEY ("couponId", "categoryId")
);
CREATE INDEX IF NOT EXISTS "CouponCategory_categoryId_idx" ON "CouponCategory" ("categoryId");

-- ───────────────────────── AutomaticDiscount ─────────────────────────

ALTER TABLE "AutomaticDiscount"
  ADD COLUMN IF NOT EXISTS "description"        TEXT,
  ADD COLUMN IF NOT EXISTS "scope"              "PromotionScope" NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS "appliesToSaleItems" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "DiscountProduct" (
  "discountId" TEXT NOT NULL,
  "productId"  TEXT NOT NULL,
  CONSTRAINT "DiscountProduct_pkey" PRIMARY KEY ("discountId", "productId")
);
CREATE INDEX IF NOT EXISTS "DiscountProduct_productId_idx" ON "DiscountProduct" ("productId");

CREATE TABLE IF NOT EXISTS "DiscountCategory" (
  "discountId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  CONSTRAINT "DiscountCategory_pkey" PRIMARY KEY ("discountId", "categoryId")
);
CREATE INDEX IF NOT EXISTS "DiscountCategory_categoryId_idx" ON "DiscountCategory" ("categoryId");

-- ──────────────────────── Storefront content ────────────────────────

CREATE TABLE IF NOT EXISTS "HomepageSection" (
  "id"        TEXT NOT NULL,
  "type"      "HomeSectionType" NOT NULL,
  "eyebrow"   TEXT,
  "title"     TEXT,
  "subtitle"  TEXT,
  "href"      TEXT,
  "linkLabel" TEXT,
  "config"    JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HomepageSection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HomepageSection_enabled_sortOrder_idx"
  ON "HomepageSection" ("enabled", "sortOrder");

CREATE TABLE IF NOT EXISTS "HeroSlide" (
  "id"        TEXT NOT NULL,
  "eyebrow"   TEXT,
  "title"     TEXT NOT NULL,
  "subtitle"  TEXT,
  "ctaLabel"  TEXT,
  "ctaHref"   TEXT,
  "imageId"   TEXT,
  "imageUrl"  TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "startsAt"  TIMESTAMP(3),
  "endsAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HeroSlide_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HeroSlide_enabled_sortOrder_idx"
  ON "HeroSlide" ("enabled", "sortOrder");

CREATE TABLE IF NOT EXISTS "NavItem" (
  "id"         TEXT NOT NULL,
  "location"   "NavLocation" NOT NULL,
  "parentId"   TEXT,
  "label"      TEXT NOT NULL,
  "href"       TEXT,
  "categoryId" TEXT,
  "icon"       TEXT,
  "badge"      TEXT,
  "newTab"     BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "enabled"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NavItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NavItem_location_enabled_sortOrder_idx"
  ON "NavItem" ("location", "enabled", "sortOrder");
CREATE INDEX IF NOT EXISTS "NavItem_parentId_idx"   ON "NavItem" ("parentId");
CREATE INDEX IF NOT EXISTS "NavItem_categoryId_idx" ON "NavItem" ("categoryId");

-- ──────────────────────────── StoreSetting ───────────────────────────

ALTER TABLE "StoreSetting"
  ADD COLUMN IF NOT EXISTS "announcementText"    TEXT,
  ADD COLUMN IF NOT EXISTS "announcementHref"    TEXT,
  ADD COLUMN IF NOT EXISTS "announcementEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "footerTagline"       TEXT,
  ADD COLUMN IF NOT EXISTS "footerNote"          TEXT;

-- ───────────────────────────── Foreign keys ─────────────────────────────

DO $$ BEGIN
  ALTER TABLE "CouponProduct"
    ADD CONSTRAINT "CouponProduct_couponId_fkey" FOREIGN KEY ("couponId")
    REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CouponProduct"
    ADD CONSTRAINT "CouponProduct_productId_fkey" FOREIGN KEY ("productId")
    REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CouponCategory"
    ADD CONSTRAINT "CouponCategory_couponId_fkey" FOREIGN KEY ("couponId")
    REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CouponCategory"
    ADD CONSTRAINT "CouponCategory_categoryId_fkey" FOREIGN KEY ("categoryId")
    REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DiscountProduct"
    ADD CONSTRAINT "DiscountProduct_discountId_fkey" FOREIGN KEY ("discountId")
    REFERENCES "AutomaticDiscount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DiscountProduct"
    ADD CONSTRAINT "DiscountProduct_productId_fkey" FOREIGN KEY ("productId")
    REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DiscountCategory"
    ADD CONSTRAINT "DiscountCategory_discountId_fkey" FOREIGN KEY ("discountId")
    REFERENCES "AutomaticDiscount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DiscountCategory"
    ADD CONSTRAINT "DiscountCategory_categoryId_fkey" FOREIGN KEY ("categoryId")
    REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NavItem"
    ADD CONSTRAINT "NavItem_parentId_fkey" FOREIGN KEY ("parentId")
    REFERENCES "NavItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NavItem"
    ADD CONSTRAINT "NavItem_categoryId_fkey" FOREIGN KEY ("categoryId")
    REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
