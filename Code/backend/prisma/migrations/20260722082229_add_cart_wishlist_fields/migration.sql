-- Cart & wishlist fields (script 09).
--
-- NOTE: this migration deliberately does NOT touch the Product full-text search
-- indexes (`Product_search_vector_idx`, `Product_title_trgm_idx`). Those are
-- created in raw SQL against the `Unsupported("tsvector")` column in the
-- add_product_search migration (script 08) and are invisible to Prisma's schema
-- diff, which would otherwise try to drop them. Leaving them alone keeps FTS
-- working.

-- One-cart-per-identity: swap the plain indexes for UNIQUE constraints on Cart.
DROP INDEX "public"."Cart_sessionId_idx";

-- DropIndex
DROP INDEX "public"."Cart_userId_idx";

-- AlterTable: applied (validated) coupon code on the cart.
ALTER TABLE "Cart" ADD COLUMN     "couponCode" TEXT;

-- AlterTable: denormalized product id + unit-price snapshot on each line.
ALTER TABLE "CartItem" ADD COLUMN     "productId" TEXT NOT NULL,
ADD COLUMN     "unitPriceCents" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_sessionId_key" ON "Cart"("sessionId");
