/**
 * Admin inventory API (script 15, FR-805). Stock adjustments are optimistic on
 * the client and reconciled against the returned row.
 */
import { apiClient } from "./client";

export interface InventoryItem {
  variantId: string;
  sku: string;
  stock: number;
  priceCents: number;
  options: Record<string, string> | null;
  productId: string;
  productTitle: string;
  productSlug: string;
  productStatus: string;
  lowStock: boolean;
}

/** Totals over the FILTERED set, not the whole catalog. */
export interface InventoryTotals {
  variants: number;
  units: number;
  /** Sum of stock x effective price, in cents. */
  retailValueCents: number;
  outOfStock: number;
  lowStock: number;
}

export interface InventoryResponse {
  items: InventoryItem[];
  page: number;
  pageSize: number;
  total: number;
  threshold: number;
  totals: InventoryTotals;
}

export interface LowStockResponse {
  items: InventoryItem[];
  threshold: number;
}

export type InventoryStockFilter = "in" | "low" | "out";

export type InventorySort =
  | "stock_asc"
  | "stock_desc"
  | "sku_asc"
  | "title_asc"
  | "price_asc"
  | "price_desc"
  | "value_desc";

export interface InventoryQuery {
  search?: string;
  /** Legacy toggle, superseded by `stock`. */
  lowStockOnly?: boolean;
  stock?: InventoryStockFilter;
  /** Matches the category AND its descendants. */
  categoryId?: string;
  brandId?: string;
  productStatus?: string;
  minStock?: number;
  maxStock?: number;
  sort?: InventorySort;
  page?: number;
  pageSize?: number;
}

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== false) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function listInventory(query: InventoryQuery = {}): Promise<InventoryResponse> {
  return apiClient.get<InventoryResponse>(
    `/admin/inventory${toQuery(query as Record<string, unknown>)}`,
  );
}

export function getLowStock(): Promise<LowStockResponse> {
  return apiClient.get<LowStockResponse>("/admin/inventory/low-stock");
}

/**
 * Set a variant's on-hand stock. `expectedStock` is the value the admin was
 * looking at; the API answers 409 if a sale changed it meanwhile (#17), so a
 * stale screen can't overwrite a concurrent decrement.
 */
export function adjustStock(
  variantId: string,
  stock: number,
  expectedStock?: number,
): Promise<InventoryItem> {
  return apiClient.patch<InventoryItem>(`/admin/inventory/${variantId}`, {
    stock,
    ...(expectedStock === undefined ? {} : { expectedStock }),
  });
}
