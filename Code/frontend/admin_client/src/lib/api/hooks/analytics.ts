"use client";

/** TanStack Query hooks for the dashboard analytics (script 15, FR-801). */
import { useQuery } from "@tanstack/react-query";
import {
  getConversion,
  getOrderStats,
  getRevenueSummary,
  getTopProducts,
  type DateRange,
} from "../analytics";

export const ANALYTICS_KEY = ["admin", "analytics"] as const;

export function useRevenueSummary() {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "revenue-summary"],
    queryFn: getRevenueSummary,
  });
}

export function useOrderStats(range: DateRange) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "order-stats", range],
    queryFn: () => getOrderStats(range),
    placeholderData: (prev) => prev,
  });
}

export function useTopProducts(range: DateRange, limit = 8) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "top-products", range, limit],
    queryFn: () => getTopProducts(range, limit),
    placeholderData: (prev) => prev,
  });
}

export function useConversion(range: DateRange) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "conversion", range],
    queryFn: () => getConversion(range),
    placeholderData: (prev) => prev,
  });
}
