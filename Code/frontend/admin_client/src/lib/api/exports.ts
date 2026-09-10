/**
 * CSV export URL builders (script 15, FR-809). Exports are streamed downloads —
 * the browser hits these as top-level GETs (a plain `<a href>` / `window.open`),
 * so the httpOnly auth cookie rides along (same mechanism as the invoice PDF).
 * We never fetch these through apiClient (that would buffer the whole file in JS).
 */
import { API_URL } from "./client";

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function ordersCsvUrl(filter: Record<string, unknown> = {}): string {
  return `${API_URL}/admin/exports/orders.csv${toQuery(filter)}`;
}

export function customersCsvUrl(): string {
  return `${API_URL}/admin/exports/customers.csv`;
}

export function productsCsvUrl(): string {
  return `${API_URL}/admin/exports/products.csv`;
}
