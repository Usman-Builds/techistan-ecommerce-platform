"use client";

/** TanStack Query hooks for review moderation (script 13, FR-702). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveReview,
  listReviewQueue,
  rejectReview,
  type ReviewQueueQuery,
} from "../reviews";

export const REVIEW_QUEUE_KEY = ["admin", "reviews"] as const;

export function useReviewQueue(query: ReviewQueueQuery) {
  return useQuery({
    queryKey: [...REVIEW_QUEUE_KEY, query],
    queryFn: () => listReviewQueue(query),
    placeholderData: (prev) => prev,
  });
}

export function useApproveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveReview(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: REVIEW_QUEUE_KEY }),
  });
}

export function useRejectReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      rejectReview(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: REVIEW_QUEUE_KEY }),
  });
}
