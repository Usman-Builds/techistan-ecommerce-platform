"use client";

/**
 * Reviews TanStack Query hooks (script 13). `useReviews` reads the paginated
 * approved list + aggregate; `useCreateReview` submits (surfacing the backend's
 * 403/409); `useVoteHelpful` casts an idempotent helpful vote and refreshes the
 * list so `votedByMe` / `helpfulCount` update.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReview,
  listReviews,
  voteHelpful,
  type CreateReviewInput,
  type ReviewListQuery,
} from "../reviews";
import { getProductBySlug } from "../products";

export const REVIEWS_KEY = (q: ReviewListQuery) =>
  ["reviews", q.productId, q.sort ?? "newest", q.page ?? 1] as const;
export const PRODUCT_KEY = (slug: string) => ["product", slug] as const;

export function useProduct(slug: string) {
  return useQuery({
    queryKey: PRODUCT_KEY(slug),
    queryFn: () => getProductBySlug(slug),
    enabled: Boolean(slug),
  });
}

export function useReviews(query: ReviewListQuery) {
  return useQuery({
    queryKey: REVIEWS_KEY(query),
    queryFn: () => listReviews(query),
    enabled: Boolean(query.productId),
  });
}

export function useCreateReview(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReviewInput) => createReview(input),
    onSuccess: () => {
      // The new review is PENDING (invisible), but refresh so the aggregate /
      // "already reviewed" state re-reads on the next open.
      void qc.invalidateQueries({ queryKey: ["reviews", productId] });
    },
  });
}

export function useVoteHelpful(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => voteHelpful(reviewId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reviews", productId] });
    },
  });
}
