-- Promotions & discounts engine (script 12). Additive columns + a redemption
-- uniqueness guard; leaves the FTS indexes and existing rows untouched.

-- Coupon: PERCENT cap + denormalized usage counter.
ALTER TABLE "Coupon" ADD COLUMN "maxDiscount" INTEGER;
ALTER TABLE "Coupon" ADD COLUMN "usedCount" INTEGER NOT NULL DEFAULT 0;

-- CouponRedemption: attributed discount + one-redemption-per-order guard.
ALTER TABLE "CouponRedemption" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;

-- Backfill usedCount from any redemptions recorded by the script-09/10 seam.
UPDATE "Coupon" c
SET "usedCount" = (
  SELECT COUNT(*) FROM "CouponRedemption" r WHERE r."couponId" = c."id"
);

-- Atomic over-redeem guard: a coupon may be redeemed at most once per order.
CREATE UNIQUE INDEX "CouponRedemption_couponId_orderId_key"
  ON "CouponRedemption" ("couponId", "orderId");

-- AutomaticDiscount: precedence ordering.
ALTER TABLE "AutomaticDiscount" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "AutomaticDiscount_priority_idx" ON "AutomaticDiscount" ("priority");

-- ProductVariant: scheduled sale pricing (FR-604).
ALTER TABLE "ProductVariant" ADD COLUMN "salePrice" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN "saleStartsAt" TIMESTAMP(3);
ALTER TABLE "ProductVariant" ADD COLUMN "saleEndsAt" TIMESTAMP(3);
