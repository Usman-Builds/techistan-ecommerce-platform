/**
 * Typed catalog-product API bindings (script 07). Public reads plus the
 * admin-guarded CRUD/bulk/duplicate/images/seo endpoints. All calls go through
 * `apiClient` (cookies auto-sent); backend `class-validator` errors surface as
 * `ApiError` with a `.message` for inline form display.
 */
import { apiClient } from "./client";

export type ProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type ProductSort =
  | "relevance"
  | "price_asc"
  | "price_desc"
  | "newest"
  | "oldest"
  | "title_asc"
  | "title_desc"
  | "best_selling"
  | "top_rated";

/**
 * Stock band, evaluated across a product's variants: `out` = every variant at
 * zero, `low` = at or under the store's low-stock threshold, `in` = above it.
 */
export type StockFilter = "in" | "low" | "out";

export type VariantOptions = Record<string, string>;

export type Variant = {
  id: string;
  productId: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  weightGrams: number | null;
  barcode: string | null;
  options: VariantOptions;
};

export type ProductImage = {
  id: string;
  productId: string;
  cloudinaryPublicId: string;
  url: string;
  alt: string | null;
  position: number;
  width: number | null;
  height: number | null;
};

export type Tag = { id: string; name: string; slug: string };

export type CategoryRef = { id: string; name: string; slug: string };

export type ProductDetail = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: ProductStatus;
  categoryId: string | null;
  brandId: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
  createdAt: string;
  updatedAt: string;
  images: ProductImage[];
  variants: Variant[];
  category: CategoryRef | null;
  tags: Tag[];
  priceMin: number | null;
  priceMax: number | null;
  rating: { average: number | null; count: number };
};

export type ProductListItem = {
  id: string;
  title: string;
  slug: string;
  status: ProductStatus;
  priceMin: number | null;
  priceMax: number | null;
  onSale?: boolean; // any variant has an active scheduled sale (script 12)
  primaryImage: { url: string; alt: string | null } | null;
  category: CategoryRef | null;
  createdAt: string;
};

export type ProductListResponse = {
  items: ProductListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type ListProductsParams = {
  page?: number;
  pageSize?: number;
  categorySlug?: string;
  /** Matches the category AND its descendants. Admin pickers hold ids. */
  categoryId?: string;
  brandId?: string;
  tag?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: ProductStatus;
  stock?: StockFilter;
  /** Only products with a sale price set (scheduled or live). */
  onSale?: boolean;
  /** Only products with no category — the "needs filing" bucket. */
  uncategorized?: boolean;
  /** Inclusive created-at window, ISO 8601. */
  createdFrom?: string;
  createdTo?: string;
  sort?: ProductSort;
  search?: string;
};

export type VariantInput = {
  sku?: string;
  price: number;
  compareAtPrice?: number;
  stock?: number;
  weightGrams?: number;
  barcode?: string;
  options: VariantOptions;
};

export type ProductInput = {
  title: string;
  slug?: string;
  description?: string;
  status?: ProductStatus;
  categoryId?: string | null;
  brandId?: string | null;
  tagIds?: string[];
  axes?: string[];
  variants?: VariantInput[];
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
};

export type SeoInput = {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
};

export type ImageInput = {
  publicId: string;
  url: string;
  alt?: string;
  position: number;
  width?: number;
  height?: number;
};

export type BulkAction = "activate" | "archive" | "delete" | "setPrice";

function toQuery(params: ListProductsParams): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // `false` is dropped along with empty/nullish values: every boolean filter
    // here is opt-in, so "false" and "not set" mean the same thing and sending
    // it would only make the query string noisier.
    if (value === undefined || value === null || value === "" || value === false) {
      continue;
    }
    q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ── Public reads ──
export function listProducts(
  params: ListProductsParams = {},
): Promise<ProductListResponse> {
  return apiClient.get<ProductListResponse>(`/products${toQuery(params)}`);
}

export function getProductBySlug(slug: string): Promise<ProductDetail> {
  return apiClient.get<ProductDetail>(`/products/${slug}`);
}

// ── Admin ──
export function listAdminProducts(
  params: ListProductsParams = {},
): Promise<ProductListResponse> {
  return apiClient.get<ProductListResponse>(`/admin/products${toQuery(params)}`);
}

export function getAdminProduct(id: string): Promise<ProductDetail> {
  return apiClient.get<ProductDetail>(`/admin/products/${id}`);
}

export function createProduct(input: ProductInput): Promise<ProductDetail> {
  return apiClient.post<ProductDetail>("/admin/products", input);
}

export function updateProduct(
  id: string,
  input: Partial<ProductInput>,
): Promise<ProductDetail> {
  return apiClient.patch<ProductDetail>(`/admin/products/${id}`, input);
}

export function deleteProduct(
  id: string,
): Promise<{ id: string; deleted: boolean }> {
  return apiClient.delete(`/admin/products/${id}`);
}

export function duplicateProduct(id: string): Promise<ProductDetail> {
  return apiClient.post<ProductDetail>(`/admin/products/${id}/duplicate`);
}

export function bulkUpdateProducts(payload: {
  ids: string[];
  action: BulkAction;
  value?: number;
}): Promise<{ action: BulkAction; affected: number; ids: string[] }> {
  return apiClient.post("/admin/products/bulk", payload);
}

export function setProductImages(
  id: string,
  images: ImageInput[],
): Promise<ProductDetail> {
  return apiClient.put<ProductDetail>(`/admin/products/${id}/images`, {
    images,
  });
}

export function updateProductSeo(
  id: string,
  seo: SeoInput,
): Promise<ProductDetail> {
  return apiClient.patch<ProductDetail>(`/admin/products/${id}/seo`, seo);
}
