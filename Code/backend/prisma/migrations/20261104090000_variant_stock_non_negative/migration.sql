-- #6: stock must never go below zero. Checkout now decrements with a guard;
-- this constraint is the backstop. Clamp any rows an earlier oversell left
-- negative first, so the constraint can be added.

UPDATE "ProductVariant" SET "stock" = 0 WHERE "stock" < 0;

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_stock_non_negative" CHECK ("stock" >= 0);
