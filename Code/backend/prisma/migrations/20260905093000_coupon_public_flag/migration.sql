-- Script 18 — opt-in public advertising for a coupon.
--
-- Needed so the storefront can show an "available offers" strip without
-- leaking targeted codes: a coupon is only advertised when a merchant ticks
-- the box, never merely because it is active.

ALTER TABLE "Coupon"
  ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Coupon_isPublic_active_idx"
  ON "Coupon" ("isPublic", "active");
