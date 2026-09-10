"use client";

import { useState } from "react";
import { Star, Loader2, Check, X, MessageSquare } from "lucide-react";
import {
  useApproveReview,
  useRejectReview,
  useReviewQueue,
} from "@/lib/api/hooks/reviews";
import type { ModerationReview, ReviewStatus } from "@/lib/api/reviews";
import { ApiError } from "@/lib/api/client";

const PAGE_SIZE = 20;

const TABS: { value: ReviewStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

function InlineStars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={i <= value ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground/40"}
          fill={i <= value ? "currentColor" : "none"}
          aria-hidden
        />
      ))}
    </span>
  );
}

export default function ReviewsModerationPage() {
  const [status, setStatus] = useState<ReviewStatus>("PENDING");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useReviewQueue({ status, page, pageSize: PAGE_SIZE });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
        <MessageSquare className="h-6 w-6" aria-hidden /> Review moderation
      </h1>
      <p className="text-sm text-muted-foreground">
        Reviews stay hidden from the storefront until approved. Approving or
        rejecting recomputes the product&apos;s aggregate rating and writes an
        audit log.
      </p>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setStatus(t.value);
              setPage(1);
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              status === t.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      ) : isError ? (
        <p className="py-16 text-center text-destructive">Failed to load reviews.</p>
      ) : !data || data.items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          No {status.toLowerCase()} reviews.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: ModerationReview }) {
  const approve = useApproveReview();
  const reject = useRejectReview();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const busy = approve.isPending || reject.isPending;
  const pending = review.status === "PENDING";

  const doApprove = async () => {
    setError(null);
    try {
      await approve.mutateAsync(review.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve.");
    }
  };

  const doReject = async () => {
    setError(null);
    try {
      await reject.mutateAsync({ id: review.id, reason: reason.trim() || undefined });
      setRejecting(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reject.");
    }
  };

  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <InlineStars value={review.rating} />
          <span className="text-sm font-medium">
            {review.product?.title ?? "Unknown product"}
          </span>
        </div>
        <time className="text-xs text-muted-foreground" dateTime={review.createdAt}>
          {new Date(review.createdAt).toLocaleString()}
        </time>
      </div>

      {review.title && <h3 className="mt-2 font-medium">{review.title}</h3>}
      {review.body && (
        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
          {review.body}
        </p>
      )}

      {review.images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {review.images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.id}
              src={img.url}
              alt={img.alt ?? "Review photo"}
              className="h-16 w-16 rounded-md border border-border object-cover"
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {review.user
            ? `${review.user.firstName} ${review.user.lastName} · ${review.user.email}`
            : "Unknown author"}
        </span>
        <span>· {review.helpfulCount} helpful</span>
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {pending && (
        <div className="mt-4 border-t border-border pt-3">
          {rejecting ? (
            <div className="space-y-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={doReject}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {reject.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <X className="h-4 w-4" aria-hidden />
                  )}
                  Confirm reject
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  disabled={busy}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={doApprove}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {approve.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-4 w-4" aria-hidden />
                )}
                Approve
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              >
                <X className="h-4 w-4" aria-hidden />
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
