-- Checkout & payments (script 10).
--
-- Hand-authored (like the cart migration) and applied with `migrate deploy`:
-- `migrate dev` is non-interactive here, and its schema diff would try to DROP
-- the raw-SQL full-text search indexes (`Product_search_vector_idx`,
-- `Product_title_trgm_idx`) it cannot see. This migration is purely additive and
-- deliberately leaves those indexes untouched.

-- AlterTable: remember which cart an order came from so payment success can clear
-- it (cart is left intact until the webhook confirms payment).
ALTER TABLE "Order" ADD COLUMN "cartId" TEXT;

-- AlterTable: track cumulative refunds against a payment (full / partial, FR-413).
ALTER TABLE "Payment" ADD COLUMN "refundedAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: idempotency ledger for Stripe webhook events (FR-414).
CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);
