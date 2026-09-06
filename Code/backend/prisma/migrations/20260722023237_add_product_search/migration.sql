-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "search_vector" tsvector;

-- CreateTable
CREATE TABLE "RecentlyViewed" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentlyViewed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecentlyViewed_userId_viewedAt_idx" ON "RecentlyViewed"("userId", "viewedAt");

-- CreateIndex
CREATE INDEX "RecentlyViewed_productId_idx" ON "RecentlyViewed"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "RecentlyViewed_userId_productId_key" ON "RecentlyViewed"("userId", "productId");

-- AddForeignKey
ALTER TABLE "RecentlyViewed" ADD CONSTRAINT "RecentlyViewed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentlyViewed" ADD CONSTRAINT "RecentlyViewed_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────── Full-text search (script 08) ───────────────────────────
-- Extensions: pg_trgm powers typo-tolerant fuzzy matching on the title.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Recompute a product's tsvector from its own title/description (weights A/B) plus
-- the names of its attached tags (weight C). SECURITY DEFINER not needed — the
-- migration owner owns these objects. Marked VOLATILE (default) since it reads tables.
CREATE OR REPLACE FUNCTION product_search_vector(p_id text, p_title text, p_description text)
RETURNS tsvector
LANGUAGE sql
AS $$
  SELECT
    setweight(to_tsvector('english', coalesce(p_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(p_description, '')), 'B') ||
    setweight(
      to_tsvector(
        'english',
        coalesce(
          (SELECT string_agg(t."name", ' ')
             FROM "ProductTag" pt
             JOIN "Tag" t ON t."id" = pt."tagId"
            WHERE pt."productId" = p_id),
          ''
        )
      ),
      'C'
    )
$$;

-- BEFORE trigger on Product: keep search_vector fresh on title/description writes.
-- (At INSERT time the product has no tags yet; the ProductTag trigger below fills
--  them in immediately after they are attached — even inside the same transaction.)
CREATE OR REPLACE FUNCTION product_search_vector_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."search_vector" := product_search_vector(NEW."id", NEW."title", NEW."description");
  RETURN NEW;
END
$$;

CREATE TRIGGER product_search_vector_update
BEFORE INSERT OR UPDATE OF "title", "description" ON "Product"
FOR EACH ROW EXECUTE FUNCTION product_search_vector_trigger();

-- When tags are attached/detached, recompute the affected product's vector.
CREATE OR REPLACE FUNCTION producttag_search_vector_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pid text;
BEGIN
  pid := COALESCE(NEW."productId", OLD."productId");
  UPDATE "Product"
     SET "search_vector" = product_search_vector("id", "title", "description")
   WHERE "id" = pid;
  RETURN NULL;
END
$$;

CREATE TRIGGER producttag_search_vector_update
AFTER INSERT OR DELETE ON "ProductTag"
FOR EACH ROW EXECUTE FUNCTION producttag_search_vector_trigger();

-- When a tag is renamed, recompute every product carrying it.
CREATE OR REPLACE FUNCTION tag_search_vector_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "Product"
     SET "search_vector" = product_search_vector("id", "title", "description")
   WHERE "id" IN (SELECT "productId" FROM "ProductTag" WHERE "tagId" = NEW."id");
  RETURN NULL;
END
$$;

CREATE TRIGGER tag_search_vector_update
AFTER UPDATE OF "name" ON "Tag"
FOR EACH ROW EXECUTE FUNCTION tag_search_vector_trigger();

-- Indexes: GIN over the tsvector (FTS) and a trigram GIN over title (fuzzy path).
CREATE INDEX "Product_search_vector_idx" ON "Product" USING GIN ("search_vector");
CREATE INDEX "Product_title_trgm_idx" ON "Product" USING GIN ("title" gin_trgm_ops);

-- Backfill any existing rows.
UPDATE "Product" SET "search_vector" = product_search_vector("id", "title", "description");
