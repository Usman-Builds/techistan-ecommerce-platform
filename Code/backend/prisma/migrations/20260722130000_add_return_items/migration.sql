-- Script 11 (Order Management): snapshot returned items + the refunded amount on
-- a ReturnRequest. Additive only — deliberately does NOT touch the script-08
-- FTS/trigram indexes on Product.search_vector.
ALTER TABLE "ReturnRequest" ADD COLUMN "items" JSONB;
ALTER TABLE "ReturnRequest" ADD COLUMN "refundAmount" INTEGER;
