/**
 * Reviews API layer (script 13, FR-701/704/705). Public reads plus the
 * authenticated submit + helpful-vote, all through the credentialed `apiClient`.
 * Photos are uploaded via the script-06 Cloudinary flow first; their MediaAsset
 * ids ride along in `mediaIds` and the backend caps them at 3.
 */
import { apiClient } from "./client";

export type ReviewSort = "newest" | "helpful" | "rating";

export interface ReviewImage {
  id: string;
  url: string;
  alt: string | null;
}

export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  helpfulCount: number;
  author: string;
  createdAt: string;
  images: ReviewImage[];
  votedByMe: boolean;
}

/** Counts per star, keyed "1".."5" (always all five present). */
export type RatingDistribution = Record<"1" | "2" | "3" | "4" | "5", number>;

export interface ReviewListResponse {
  items: PublicReview[];
  total: number;
  page: number;
  pageSize: number;
  aggregate: { average: number | null; count: number };
  distribution: RatingDistribution;
}

export interface ReviewListQuery {
  productId: string;
  sort?: ReviewSort;
  page?: number;
  pageSize?: number;
}

export interface CreateReviewInput {
  productId: string;
  rating: number;
  title?: string;
  body?: string;
  mediaIds?: string[];
}

export interface SubmittedReview {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rating: number;
}

export interface HelpfulResult {
  reviewId: string;
  helpfulCount: number;
  voted: boolean;
}

function toQuery(q: ReviewListQuery): string {
  const p = new URLSearchParams({ productId: q.productId });
  if (q.sort) p.set("sort", q.sort);
  if (q.page) p.set("page", String(q.page));
  if (q.pageSize) p.set("pageSize", String(q.pageSize));
  return `?${p.toString()}`;
}

export function listReviews(query: ReviewListQuery): Promise<ReviewListResponse> {
  return apiClient.get<ReviewListResponse>(`/reviews${toQuery(query)}`);
}

export function createReview(input: CreateReviewInput): Promise<SubmittedReview> {
  return apiClient.post<SubmittedReview>("/reviews", input);
}

export function voteHelpful(reviewId: string): Promise<HelpfulResult> {
  return apiClient.post<HelpfulResult>(`/reviews/${reviewId}/helpful`);
}
