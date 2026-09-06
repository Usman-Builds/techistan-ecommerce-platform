-- Script 19 — five new homepage block types.
--
-- The homepage was a hero, a trust bar and a column of near-identical product
-- rails. These add the block KINDS a store needs to look composed rather than
-- merely stocked: an editorial product feature, a category mosaic, real
-- customer reviews, the brands carried, and a short FAQ.
--
-- Additive only. Existing rows keep their type, and the storefront already
-- skips any type it does not recognise, so the API and the two clients can be
-- deployed in any order.

ALTER TYPE "HomeSectionType" ADD VALUE IF NOT EXISTS 'CATEGORY_GRID';
ALTER TYPE "HomeSectionType" ADD VALUE IF NOT EXISTS 'SPOTLIGHT';
ALTER TYPE "HomeSectionType" ADD VALUE IF NOT EXISTS 'BRAND_STRIP';
ALTER TYPE "HomeSectionType" ADD VALUE IF NOT EXISTS 'TESTIMONIALS';
ALTER TYPE "HomeSectionType" ADD VALUE IF NOT EXISTS 'FAQ';
