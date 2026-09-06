-- Inventory low-stock threshold (script 15, FR-805).
-- Additive: one integer column on the StoreSetting singleton. Hand-authored (not
-- via `migrate dev`) so the auto-diff can't drop the script-08 FTS/trigram GIN
-- indexes on Product.search_vector (Prisma sees that Unsupported column as drift).

ALTER TABLE "StoreSetting"
  ADD COLUMN "lowStockThreshold" INTEGER NOT NULL DEFAULT 5;
