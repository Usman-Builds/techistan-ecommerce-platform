-- #33: customers upload review photos. Record who uploaded each MediaAsset so a
-- review can only attach the author's own uploads. Null for the admin library
-- (and for every existing row).

ALTER TABLE "MediaAsset" ADD COLUMN "uploadedById" INTEGER;

CREATE INDEX "MediaAsset_uploadedById_idx" ON "MediaAsset"("uploadedById");

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
