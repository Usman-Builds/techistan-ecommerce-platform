/**
 * Storefront product reads (script 07 backend; PDP + listings land in script 14).
 * The by-slug detail powers the PDP (gallery, variants, reviews); the paginated
 * list powers the homepage featured grid, category listings, and related rails.
 * All prices are integer cents; sale-aware `effectivePrice` is decorated server
 * side. Server variants are error-tolerant for SSR.
 */
import { apiClient } from "./client";
import { serverGet } from "@/lib/server/api";

export interface ProductRating {
  average: number | null;
  count: number;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
}

export interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  options: Record<string, string>;
  /** Sale-aware price (falls back to `price` when no active sale). */
  effectivePrice: number;
  /** Compare-at strike-through price when a sale is active, else null. */
  saleCompareAt: number | null;
  onSale: boolean;
}

export interface ProductTag {
  id: string;
  name: string;
  slug: string;
}

export interface ProductDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  onSale: boolean;
  rating: ProductRating;
  images: ProductImage[];
  variants: ProductVariant[];
  category: { id: string; name: string; slug: string } | null;
  brand: { id: string; name: string; slug: string } | null;
  tags: ProductTag[];
}

/** Lightweight card shape (ProductService.toListItem). */
export interface ProductListItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  priceMin: number | null;
  priceMax: number | null;
  onSale: boolean;
  rating: ProductRating;
  primaryImage: { url: string; alt: string | null } | null;
  category: { id: string; name: string; slug: string } | null;
}

export interface ProductListResponse {
  items: ProductListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export type ProductSort =
  | "newest"
  | "price_asc"
  | "price_desc"
  | "best_selling"
  | "top_rated";

export interface ProductQuery {
  categorySlug?: string;
  tag?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
  featured?: boolean;
  search?: string;
}

const EMPTY_LIST: ProductListResponse = {
  items: [],
  page: 1,
  pageSize: 24,
  total: 0,
};

export function productQueryString(q: ProductQuery): string {
  const sp = new URLSearchParams();
  if (q.categorySlug) sp.set("categorySlug", q.categorySlug);
  if (q.tag) sp.set("tag", q.tag);
  if (q.minPrice != null) sp.set("minPrice", String(q.minPrice));
  if (q.maxPrice != null) sp.set("maxPrice", String(q.maxPrice));
  if (q.sort) sp.set("sort", q.sort);
  if (q.page != null) sp.set("page", String(q.page));
  if (q.pageSize != null) sp.set("pageSize", String(q.pageSize));
  if (q.featured) sp.set("featured", "true");
  if (q.search) sp.set("search", q.search);
  return sp.toString();
}

export function getProductBySlug(slug: string): Promise<ProductDetail> {
  return apiClient.get<ProductDetail>(`/products/${slug}`);
}

export async function getProductBySlugServer(
  slug: string,
): Promise<ProductDetail | null> {
  return serverGet<ProductDetail>(`/products/${encodeURIComponent(slug)}`);
}

export function listProducts(q: ProductQuery): Promise<ProductListResponse> {
  return apiClient.get<ProductListResponse>(`/products?${productQueryString(q)}`);
}

export async function listProductsServer(
  q: ProductQuery,
): Promise<ProductListResponse> {
  return (
    (await serverGet<ProductListResponse>(`/products?${productQueryString(q)}`)) ??
    EMPTY_LIST
  );
}
