-- Reviews & ratings (script 13, FR-701..705).
-- Additive: denormalized aggregate rating on Product + the ReviewVote table for
-- one-helpful-vote-per-user-per-review. Review / ReviewImage already exist (03).

-- Product aggregate rating (recomputed on every moderation action; APPROVED only).
ALTER TABLE "Product"
  ADD COLUMN "ratingAverage" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ratingCount"   INTEGER NOT NULL DEFAULT 0;

-- Helpful votes.
CREATE TABLE "ReviewVote" (
    "id"        TEXT NOT NULL,
    "reviewId"  TEXT NOT NULL,
    "userId"    INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewVote_reviewId_userId_key" ON "ReviewVote"("reviewId", "userId");
CREATE INDEX "ReviewVote_reviewId_idx" ON "ReviewVote"("reviewId");
CREATE INDEX "ReviewVote_userId_idx" ON "ReviewVote"("userId");

ALTER TABLE "ReviewVote"
  ADD CONSTRAINT "ReviewVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewVote"
  ADD CONSTRAINT "ReviewVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill aggregate rating from any pre-existing APPROVED reviews (0 normally).
UPDATE "Product" p SET
  "ratingCount" = sub.cnt,
  "ratingAverage" = sub.avg100
FROM (
  SELECT "productId", COUNT(*)::int AS cnt, ROUND(AVG("rating") * 100)::int AS avg100
  FROM "Review"
  WHERE "status" = 'APPROVED'
  GROUP BY "productId"
) sub
WHERE p."id" = sub."productId";
