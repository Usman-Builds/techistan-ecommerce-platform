/**
 * Admin analytics API (script 15, FR-801). Reads the `@AdminOnly()` aggregate
 * endpoints via the credentialed apiClient. All money is integer cents.
 */
import { apiClient } from "./client";

export interface RevenueBucket {
  revenueCents: number;
  orderCount: number;
}

export interface RevenueSummary {
  currency: string;
  today: RevenueBucket;
  week: RevenueBucket;
  month: RevenueBucket;
  year: RevenueBucket;
  aovCents: number;
}

export interface TimeSeriesPoint {
  date: string;
  revenueCents: number;
  orderCount: number;
}

export interface OrderStats {
  totalOrders: number;
  byStatus: Record<string, number>;
  series: TimeSeriesPoint[];
}

export interface TopProduct {
  productId: string;
  title: string;
  slug: string;
  unitsSold: number;
  revenueCents: number;
}

export interface ConversionStats {
  currency: string;
  cartsCreated: number;
  paidOrders: number;
  totalOrders: number;
  conversionRate: number;
  aovCents: number;
}

export interface DateRange {
  from?: string;
  to?: string;
}

function rangeQuery(range: DateRange, extra: Record<string, unknown> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...range, ...extra })) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function getRevenueSummary(): Promise<RevenueSummary> {
  return apiClient.get<RevenueSummary>("/admin/analytics/revenue-summary");
}

export function getOrderStats(range: DateRange = {}): Promise<OrderStats> {
  return apiClient.get<OrderStats>(`/admin/analytics/order-stats${rangeQuery(range)}`);
}

export function getTopProducts(range: DateRange = {}, limit = 8): Promise<TopProduct[]> {
  return apiClient.get<TopProduct[]>(
    `/admin/analytics/top-products${rangeQuery(range, { limit })}`,
  );
}

export function getConversion(range: DateRange = {}): Promise<ConversionStats> {
  return apiClient.get<ConversionStats>(`/admin/analytics/conversion${rangeQuery(range)}`);
}
