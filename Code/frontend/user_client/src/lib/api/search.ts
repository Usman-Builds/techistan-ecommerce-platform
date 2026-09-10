/**
 * Search + recently-viewed API bindings (script 08). All search endpoints are
 * public `GET`s on the NestJS backend; recently-viewed uses the shared cookie/
 * credentialed `apiClient` so it works for both guests (cookie) and customers
 * (per-account). Money is integer cents.
 */
import { apiClient } from "./client";

// ─────────────────────────── Response shapes (mirror the backend) ───────────

export interface SearchCard {
  id: string;
  title: string;
  slug: string;
  priceMin: number | null;
  priceMax: number | null;
  primaryImage: { url: string; alt: string | null } | null;
  rating: { average: number | null; count: number };
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
  min: number;
  max: number | null;
  count: number;
}
export interface RatingFacet {
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

export interface SearchResponse {
  items: SearchCard[];
  total: number;
  page: number;
  pageSize: number;
  facets: SearchFacets;
}

export interface Suggestion {
  type: "product" | "category";
  id: string;
  title: string;
  slug: string;
  thumbnail: string | null;
}

/** Recently-viewed / list-card shape (ProductService.toListItem). */
export interface ProductListCard {
  id: string;
  title: string;
  slug: string;
  status: string;
  priceMin: number | null;
  priceMax: number | null;
  primaryImage: { url: string; alt: string | null } | null;
  category: { id: string; name: string; slug: string } | null;
  createdAt: string;
}

// ─────────────────────────── Query params ───────────────────────────

export type SortOption =
  | "relevance"
  | "price_asc"
  | "price_desc"
  | "newest"
  | "best_selling"
  | "top_rated";

export interface SearchQuery {
  q?: string;
  category?: string[];
  brand?: string[];
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock?: boolean;
  sort?: SortOption;
  page?: number;
  pageSize?: number;
}

/** Serialize a SearchQuery to a URL query string (repeats multi-value facets). */
export function toSearchQueryString(params: SearchQuery): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  params.category?.forEach((c) => sp.append("category", c));
  params.brand?.forEach((b) => sp.append("brand", b));
  if (params.minPrice != null) sp.set("minPrice", String(params.minPrice));
  if (params.maxPrice != null) sp.set("maxPrice", String(params.maxPrice));
  if (params.rating != null) sp.set("rating", String(params.rating));
  if (params.inStock) sp.set("inStock", "true");
  if (params.sort) sp.set("sort", params.sort);
  if (params.page != null) sp.set("page", String(params.page));
  if (params.pageSize != null) sp.set("pageSize", String(params.pageSize));
  return sp.toString();
}

// ─────────────────────────── Calls ───────────────────────────

export function searchProducts(
  params: SearchQuery,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  return apiClient.get<SearchResponse>(
    `/search?${toSearchQueryString(params)}`,
    { signal },
  );
}

export function suggest(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  return apiClient.get<Suggestion[]>(
    `/search/suggest?q=${encodeURIComponent(q)}`,
    { signal },
  );
}

export function getFacets(params: SearchQuery): Promise<SearchFacets> {
  return apiClient.get<SearchFacets>(`/search/facets?${toSearchQueryString(params)}`);
}

export function getRecentlyViewed(): Promise<ProductListCard[]> {
  return apiClient.get<ProductListCard[]>("/recently-viewed");
}

export function recordView(productId: string): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>("/recently-viewed", { productId });
}
