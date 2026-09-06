import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProductSort } from '../../product/dto/list-products.dto';
import { SearchParamsDto } from '../dto/search-params.dto';
import { buildTsQuery } from '../synonyms';
import {
  BrandFacet,
  CategoryFacet,
  SearchCard,
  SearchFacets,
  SearchProvider,
  SearchResult,
  Suggestion,
} from './search-provider.interface';

/** Predefined price facet buckets (integer cents). Last bucket is open-ended. */
const PRICE_BUCKETS: Array<{ min: number; max: number | null }> = [
  { min: 0, max: 2500 },
  { min: 2500, max: 5000 },
  { min: 5000, max: 10000 },
  { min: 10000, max: 25000 },
  { min: 25000, max: null },
];

/** "N stars & up" rating facets. */
const RATING_THRESHOLDS = [4, 3, 2, 1];

// ts_headline markers. Deliberately NOT HTML — the client escapes the snippet and
// only then swaps these for <mark>, so admin-authored title/description text can
// never inject markup (XSS-safe highlighting).
const HL_TITLE = 'StartSel=<<<HL>>>, StopSel=<<</HL>>>, HighlightAll=TRUE';
const HL_BODY =
  'StartSel=<<<HL>>>, StopSel=<<</HL>>>, MaxFragments=2, MaxWords=28, MinWords=8, ShortWord=3';

/**
 * Fuzzy/typo floor using pg_trgm `word_similarity(query, title)` — it scores the
 * query against the *closest word* in the title, so a single misspelled word
 * still matches a multi-word title (plain `similarity` over the whole title is
 * far too low for that). Calibrated so typical one-character typos pass.
 */
const WORD_SIM_THRESHOLD = 0.35;

/** Which filter dimension to leave out when computing a facet (drilldown semantics). */
type FacetOmit = 'category' | 'brand' | 'price' | 'rating' | 'stock';

interface RawItem {
  id: string;
  title: string;
  slug: string;
  price_min: number | null;
  price_max: number | null;
  image_url: string | null;
  image_alt: string | null;
  rating_avg: number | null;
  rating_count: number;
  sold: number;
  score: number | null;
  hl_title: string | null;
  hl_body: string | null;
}

/**
 * Postgres full-text search provider (script 08). Blends `tsvector`/`ts_rank`
 * relevance with `pg_trgm` trigram similarity (typo tolerance), expands synonyms
 * at query-build time, returns `ts_headline` snippets, and computes faceted
 * counts with drilldown semantics (each facet ignores its own selection so
 * multi-select stays intuitive). All money is integer cents.
 */
@Injectable()
export class PgSearchProvider implements SearchProvider {
  constructor(private readonly prisma: PrismaService) {}

  async search(params: SearchParamsDto): Promise<SearchResult> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 24;
    const offset = (page - 1) * pageSize;
    const tsq = buildTsQuery(params.q);

    const where = this.whereClause(params, tsq);
    const orderBy = this.orderByClause(params, tsq);

    const itemsSql = Prisma.sql`
      SELECT
        p."id"    AS id,
        p."title" AS title,
        p."slug"  AS slug,
        (SELECT MIN(v."price") FROM "ProductVariant" v WHERE v."productId" = p."id")::int AS price_min,
        (SELECT MAX(v."price") FROM "ProductVariant" v WHERE v."productId" = p."id")::int AS price_max,
        img."url" AS image_url,
        img."alt" AS image_alt,
        (SELECT AVG(r."rating")::float8 FROM "Review" r
          WHERE r."productId" = p."id" AND r."status" = 'APPROVED') AS rating_avg,
        (SELECT COUNT(*)::int FROM "Review" r
          WHERE r."productId" = p."id" AND r."status" = 'APPROVED') AS rating_count,
        (SELECT COALESCE(SUM(oi."quantity"), 0)::int
           FROM "OrderItem" oi
           JOIN "ProductVariant" v2 ON v2."id" = oi."variantId"
          WHERE v2."productId" = p."id") AS sold,
        ${this.scoreSelect(params, tsq)} AS score,
        ${this.headlineTitleSelect(tsq)} AS hl_title,
        ${this.headlineBodySelect(tsq)}  AS hl_body
      FROM "Product" p
      LEFT JOIN LATERAL (
        SELECT pi."url", pi."alt"
          FROM "ProductImage" pi
         WHERE pi."productId" = p."id"
         ORDER BY pi."position" ASC
         LIMIT 1
      ) img ON TRUE
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const countSql = Prisma.sql`SELECT COUNT(*)::int AS count FROM "Product" p WHERE ${where}`;

    const [rows, countRows, facets] = await Promise.all([
      this.prisma.$queryRaw<RawItem[]>(itemsSql),
      this.prisma.$queryRaw<{ count: number }[]>(countSql),
      this.computeFacets(params, tsq),
    ]);

    return {
      items: rows.map((r) => this.toCard(r, tsq != null)),
      total: countRows[0]?.count ?? 0,
      page,
      pageSize,
      facets,
    };
  }

  async facets(params: SearchParamsDto): Promise<SearchFacets> {
    return this.computeFacets(params, buildTsQuery(params.q));
  }

  async suggest(query: string): Promise<Suggestion[]> {
    const q = query.trim();
    if (!q) return [];
    const like = `%${q}%`;
    const prefix = `${q}%`;
    const tsq = buildTsQuery(q);

    const textPred = tsq
      ? Prisma.sql`(p."title" ILIKE ${like} OR word_similarity(${q}, p."title") > ${WORD_SIM_THRESHOLD} OR p."search_vector" @@ to_tsquery('english', ${tsq}))`
      : Prisma.sql`(p."title" ILIKE ${like} OR word_similarity(${q}, p."title") > ${WORD_SIM_THRESHOLD})`;

    const [products, categories] = await Promise.all([
      this.prisma.$queryRaw<
        { id: string; title: string; slug: string; thumbnail: string | null }[]
      >(Prisma.sql`
        SELECT p."id" AS id, p."title" AS title, p."slug" AS slug,
          (SELECT pi."url" FROM "ProductImage" pi
            WHERE pi."productId" = p."id" ORDER BY pi."position" ASC LIMIT 1) AS thumbnail
        FROM "Product" p
        WHERE p."status" = 'ACTIVE' AND ${textPred}
        ORDER BY (p."title" ILIKE ${prefix}) DESC, word_similarity(${q}, p."title") DESC, p."title" ASC
        LIMIT 5
      `),
      this.prisma.$queryRaw<
        { id: string; name: string; slug: string; imageUrl: string | null }[]
      >(Prisma.sql`
        SELECT "id" AS id, "name" AS name, "slug" AS slug, "imageUrl"
        FROM "Category"
        WHERE "name" ILIKE ${like}
        ORDER BY ("name" ILIKE ${prefix}) DESC, "name" ASC
        LIMIT 3
      `),
    ]);

    return [
      ...products.map((p) => ({
        type: 'product' as const,
        id: p.id,
        title: p.title,
        slug: p.slug,
        thumbnail: p.thumbnail,
      })),
      ...categories.map((c) => ({
        type: 'category' as const,
        id: c.id,
        title: c.name,
        slug: c.slug,
        thumbnail: c.imageUrl,
      })),
    ].slice(0, 8);
  }

  // For Postgres the tsvector is trigger-maintained and rows live in the same DB,
  // so these are no-ops — they exist only to honor the SearchProvider contract for
  // a future external engine (Meilisearch/Typesense) that keeps a separate index.
  async indexProduct(_productId: string): Promise<void> {
    /* no-op for the PG provider */
  }
  async removeProduct(_productId: string): Promise<void> {
    /* no-op for the PG provider */
  }

  // ─────────────────────────── query building ───────────────────────────

  private conditions(
    params: SearchParamsDto,
    tsq: string | null,
    omit?: FacetOmit,
  ): Prisma.Sql[] {
    const c: Prisma.Sql[] = [Prisma.sql`p."status" = 'ACTIVE'`];
    const q = params.q?.trim();

    if (tsq) {
      c.push(
        Prisma.sql`(p."search_vector" @@ to_tsquery('english', ${tsq}) OR word_similarity(${q ?? ''}, p."title") > ${WORD_SIM_THRESHOLD})`,
      );
    } else if (q) {
      c.push(Prisma.sql`word_similarity(${q}, p."title") > ${WORD_SIM_THRESHOLD}`);
    }

    if (omit !== 'category' && params.category?.length) {
      c.push(
        Prisma.sql`p."categoryId" IN (SELECT "id" FROM "Category" WHERE "slug" IN (${Prisma.join(params.category)}))`,
      );
    }
    if (omit !== 'brand' && params.brand?.length) {
      c.push(
        Prisma.sql`p."brandId" IN (SELECT "id" FROM "Brand" WHERE "slug" IN (${Prisma.join(params.brand)}))`,
      );
    }
    if (
      omit !== 'price' &&
      (params.minPrice != null || params.maxPrice != null)
    ) {
      const min = params.minPrice ?? 0;
      const maxFrag =
        params.maxPrice != null
          ? Prisma.sql` AND v."price" <= ${params.maxPrice}`
          : Prisma.empty;
      c.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id" AND v."price" >= ${min}${maxFrag})`,
      );
    }
    if (omit !== 'stock' && params.inStock) {
      c.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id" AND v."stock" > 0)`,
      );
    }
    if (omit !== 'rating' && params.rating != null) {
      c.push(
        Prisma.sql`(SELECT COALESCE(AVG(r."rating"), 0) FROM "Review" r WHERE r."productId" = p."id" AND r."status" = 'APPROVED') >= ${params.rating}`,
      );
    }
    return c;
  }

  private whereClause(
    params: SearchParamsDto,
    tsq: string | null,
    omit?: FacetOmit,
  ): Prisma.Sql {
    return Prisma.join(this.conditions(params, tsq, omit), ' AND ');
  }

  private orderByClause(params: SearchParamsDto, tsq: string | null): Prisma.Sql {
    switch (params.sort) {
      case ProductSort.PRICE_ASC:
        return Prisma.sql`price_min ASC NULLS LAST`;
      case ProductSort.PRICE_DESC:
        return Prisma.sql`price_min DESC NULLS LAST`;
      case ProductSort.NEWEST:
        return Prisma.sql`p."createdAt" DESC`;
      case ProductSort.BEST_SELLING:
        return Prisma.sql`sold DESC, p."createdAt" DESC`;
      case ProductSort.TOP_RATED:
        return Prisma.sql`rating_avg DESC NULLS LAST, p."createdAt" DESC`;
      case ProductSort.RELEVANCE:
      default:
        // Relevance is the default WHEN a query is present; otherwise newest.
        return tsq || params.q?.trim()
          ? Prisma.sql`score DESC, p."createdAt" DESC`
          : Prisma.sql`p."createdAt" DESC`;
    }
  }

  private scoreSelect(params: SearchParamsDto, tsq: string | null): Prisma.Sql {
    const q = params.q?.trim();
    if (tsq) {
      return Prisma.sql`(ts_rank(p."search_vector", to_tsquery('english', ${tsq})) + word_similarity(${q ?? ''}, p."title"))::float8`;
    }
    if (q) {
      return Prisma.sql`word_similarity(${q}, p."title")::float8`;
    }
    return Prisma.sql`0::float8`;
  }

  private headlineTitleSelect(tsq: string | null): Prisma.Sql {
    if (!tsq) return Prisma.sql`NULL`;
    return Prisma.sql`ts_headline('english', p."title", to_tsquery('english', ${tsq}), ${HL_TITLE})`;
  }

  private headlineBodySelect(tsq: string | null): Prisma.Sql {
    if (!tsq) return Prisma.sql`NULL`;
    return Prisma.sql`ts_headline('english', COALESCE(p."description", ''), to_tsquery('english', ${tsq}), ${HL_BODY})`;
  }

  // ─────────────────────────── facets ───────────────────────────

  private async computeFacets(
    params: SearchParamsDto,
    tsq: string | null,
  ): Promise<SearchFacets> {
    const [cats, brands, priceRows, ratingRows, stockRows] = await Promise.all([
      this.prisma.$queryRaw<CategoryFacet[]>(Prisma.sql`
        SELECT c."slug" AS slug, c."name" AS name, COUNT(*)::int AS count
        FROM "Product" p JOIN "Category" c ON c."id" = p."categoryId"
        WHERE ${this.whereClause(params, tsq, 'category')}
        GROUP BY c."slug", c."name"
        ORDER BY count DESC, c."name" ASC
        LIMIT 50
      `),
      this.prisma.$queryRaw<BrandFacet[]>(Prisma.sql`
        SELECT b."slug" AS slug, b."name" AS name, COUNT(*)::int AS count
        FROM "Product" p JOIN "Brand" b ON b."id" = p."brandId"
        WHERE ${this.whereClause(params, tsq, 'brand')}
        GROUP BY b."slug", b."name"
        ORDER BY count DESC, b."name" ASC
        LIMIT 50
      `),
      this.prisma.$queryRaw<{ min_price: number | null }[]>(Prisma.sql`
        SELECT (SELECT MIN(v."price") FROM "ProductVariant" v WHERE v."productId" = p."id")::int AS min_price
        FROM "Product" p WHERE ${this.whereClause(params, tsq, 'price')}
      `),
      this.prisma.$queryRaw<{ avg: number | null }[]>(Prisma.sql`
        SELECT (SELECT AVG(r."rating")::float8 FROM "Review" r
                 WHERE r."productId" = p."id" AND r."status" = 'APPROVED') AS avg
        FROM "Product" p WHERE ${this.whereClause(params, tsq, 'rating')}
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count FROM "Product" p
        WHERE ${this.whereClause(params, tsq, 'stock')}
          AND EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id" AND v."stock" > 0)
      `),
    ]);

    const priceBuckets = PRICE_BUCKETS.map((b) => ({
      min: b.min,
      max: b.max,
      count: priceRows.filter(
        (r) =>
          r.min_price != null &&
          r.min_price >= b.min &&
          (b.max == null || r.min_price < b.max),
      ).length,
    }));

    const ratings = RATING_THRESHOLDS.map((min) => ({
      min,
      count: ratingRows.filter((r) => r.avg != null && r.avg >= min).length,
    }));

    return {
      categories: cats,
      brands,
      priceBuckets,
      ratings,
      inStock: stockRows[0]?.count ?? 0,
    };
  }

  private toCard(r: RawItem, hasHighlight: boolean): SearchCard {
    return {
      id: r.id,
      title: r.title,
      slug: r.slug,
      priceMin: r.price_min ?? null,
      priceMax: r.price_max ?? null,
      primaryImage: r.image_url
        ? { url: r.image_url, alt: r.image_alt ?? null }
        : null,
      rating: {
        average: r.rating_avg != null ? Number(r.rating_avg) : null,
        count: r.rating_count ?? 0,
      },
      highlight: hasHighlight
        ? { title: r.hl_title ?? null, description: r.hl_body ?? null }
        : null,
      score: r.score != null ? Number(r.score) : 0,
    };
  }
}
