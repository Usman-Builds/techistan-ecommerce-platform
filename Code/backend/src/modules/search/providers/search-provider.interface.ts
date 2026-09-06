import { SearchParamsDto } from '../dto/search-params.dto';

/**
 * DI token for the active {@link SearchProvider}. The concrete binding is chosen
 * from `SEARCH_DRIVER` in {@link SearchModule}; callers only ever depend on the
 * interface, so swapping Postgres FTS for Meilisearch/Typesense later touches
 * nothing but the token binding (CR-001).
 */
export const SEARCH_PROVIDER = 'SEARCH_PROVIDER';

/** A single search result row, shaped for a storefront product card. */
export interface SearchCard {
  id: string;
  title: string;
  slug: string;
  priceMin: number | null;
  priceMax: number | null;
  primaryImage: { url: string; alt: string | null } | null;
  rating: { average: number | null; count: number };
  /** ts_headline snippets (markers swapped to <mark> client-side). Null when no query. */
  highlight: { title: string | null; description: string | null } | null;
  score: number;
}

export interface CategoryFacet {
  slug: string;
  name: string;
  count: number;
}
export interface BrandFacet {
  slug: string;
  name: string;
  count: number;
}
export interface PriceBucketFacet {
  /** Inclusive lower bound in integer cents. */
  min: number;
  /** Exclusive upper bound in cents, or null for the open-ended top bucket. */
  max: number | null;
  count: number;
}
export interface RatingFacet {
  /** Minimum average rating (e.g. 4 = "4 stars & up"). */
  min: number;
  count: number;
}

export interface SearchFacets {
  categories: CategoryFacet[];
  brands: BrandFacet[];
  priceBuckets: PriceBucketFacet[];
  ratings: RatingFacet[];
  inStock: number;
}

export interface SearchResult {
  items: SearchCard[];
  total: number;
  page: number;
  pageSize: number;
  facets: SearchFacets;
}

export interface Suggestion {
  type: 'product' | 'category';
  id: string;
  title: string;
  slug: string;
  thumbnail: string | null;
}

/**
 * Swappable search engine. The Postgres-backed {@link PgSearchProvider} is the
 * default; the `indexProduct`/`removeProduct` hooks are no-ops there (the data
 * already lives in Postgres and the tsvector is trigger-maintained) but stay on
 * the interface so a future external engine can keep its index in sync.
 */
export interface SearchProvider {
  search(params: SearchParamsDto): Promise<SearchResult>;
  facets(params: SearchParamsDto): Promise<SearchFacets>;
  suggest(query: string): Promise<Suggestion[]>;
  indexProduct(productId: string): Promise<void>;
  removeProduct(productId: string): Promise<void>;
}
