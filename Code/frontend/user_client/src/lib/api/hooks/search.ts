"use client";

/**
 * TanStack Query hooks for search + recently-viewed (script 08). `useSuggest`
 * cancels stale requests automatically (the query signal is forwarded to fetch)
 * and keeps previous results while typing; the ≤200ms debounce lives in the
 * autocomplete component (NFR-106).
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getFacets,
  getRecentlyViewed,
  recordView,
  searchProducts,
  suggest,
  type SearchQuery,
} from "../search";

export const SEARCH_KEY = ["search"] as const;
export const RECENTLY_VIEWED_KEY = ["recently-viewed"] as const;

export function useSearch(params: SearchQuery) {
  return useQuery({
    queryKey: [...SEARCH_KEY, "results", params],
    queryFn: ({ signal }) => searchProducts(params, signal),
    placeholderData: keepPreviousData,
  });
}

/** Standalone facet counts (for panels that refresh independently of results). */
export function useFacets(params: SearchQuery) {
  return useQuery({
    queryKey: [...SEARCH_KEY, "facets", params],
    queryFn: () => getFacets(params),
    placeholderData: keepPreviousData,
  });
}

export function useSuggest(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: [...SEARCH_KEY, "suggest", q],
    queryFn: ({ signal }) => suggest(q, signal),
    enabled: q.length >= 1,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useRecentlyViewed() {
  return useQuery({
    queryKey: RECENTLY_VIEWED_KEY,
    queryFn: getRecentlyViewed,
  });
}

export function useRecordView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => recordView(productId),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECENTLY_VIEWED_KEY }),
  });
}
