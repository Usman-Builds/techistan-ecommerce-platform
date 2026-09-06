-- Abandoned-cart recovery (script 16, FR-306).
-- Additive columns on Cart: an optional captured guest email and a recovery-stage
-- counter (0 none / 1 = 1h nudge sent / 2 = 24h nudge sent) so each stage fires at
-- most once. Hand-authored (migrate deploy) so the auto-diff never drops the
-- script-08 FTS/trigram GIN indexes on the Unsupported(tsvector) search_vector.
ALTER TABLE "Cart" ADD COLUMN "guestEmail" TEXT;
ALTER TABLE "Cart" ADD COLUMN "recoveryStage" INTEGER NOT NULL DEFAULT 0;
