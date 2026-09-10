/**
 * Review moderation admin API (script 13, FR-702). Queue read + approve/reject
 * through the credentialed `apiClient` against the `@AdminOnly()`-guarded backend
 * (RBAC enforced server-side, NFR-208). Each action recomputes the product's
 * aggregate rating and writes an audit log on the backend.
 */
import { apiClient } from "./client";

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ModerationReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: ReviewStatus;
  helpfulCount: number;
  createdAt: string;
  images: { id: string; url: string; alt: string | null }[];
  product: { id: string; title: string; slug: string } | null;
  user: { id: number; firstName: string; lastName: string; email: string } | null;
}

export interface ReviewQueueResponse {
  items: ModerationReview[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReviewQueueQuery {
  status?: ReviewStatus;
  page?: number;
  pageSize?: number;
}

function toQuery(params: ReviewQueueQuery): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function listReviewQueue(query: ReviewQueueQuery = {}): Promise<ReviewQueueResponse> {
  return apiClient.get<ReviewQueueResponse>(`/admin/reviews${toQuery(query)}`);
}

export function approveReview(id: string): Promise<ModerationReview> {
  return apiClient.patch<ModerationReview>(`/admin/reviews/${id}/approve`, {});
}

export function rejectReview(id: string, reason?: string): Promise<ModerationReview> {
  return apiClient.patch<ModerationReview>(
    `/admin/reviews/${id}/reject`,
    reason ? { reason } : {},
  );
}
