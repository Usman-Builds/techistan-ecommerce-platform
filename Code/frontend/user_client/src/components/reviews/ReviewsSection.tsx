"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, PenLine } from "lucide-react";
import { ReviewSummary } from "./ReviewSummary";
import { ReviewList } from "./ReviewList";
import { WriteReviewForm } from "./WriteReviewForm";
import { useReviews } from "@/lib/api/hooks/reviews";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { ReviewSort } from "@/lib/api/reviews";

const PAGE_SIZE = 10;

const SORTS: { value: ReviewSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "helpful", label: "Most helpful" },
  { value: "rating", label: "Highest rated" },
];

/**
 * Full reviews block for a product page (script 13). Aggregate + distribution,
 * sortable/paginated approved list with helpful voting, and a gated write form
 * (signed-in only; the backend enforces verified-purchase and surfaces 403/409).
 * The PDP shell lands in script 14 — this section slots into it.
 */
export function ReviewsSection({ productId }: { productId: string }) {
  const { isAuthenticated } = useAuth();
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);

  const { data, isLoading, isError } = useReviews({
    productId,
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <section aria-labelledby="reviews-heading" className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 id="reviews-heading" className="font-heading text-xl font-bold">
          Ratings &amp; Reviews
        </h2>
        {isAuthenticated ? (
          <button
            type="button"
            onClick={() => setWriting((w) => !w)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <PenLine className="h-4 w-4" aria-hidden />
            {writing ? "Cancel" : "Write a review"}
          </button>
        ) : (
          <Link
            href="/login"
            className="text-sm font-medium text-primary hover:underline"
          >
            Sign in to review
          </Link>
        )}
      </div>

      {writing && isAuthenticated && (
        <WriteReviewForm productId={productId} onDone={() => setWriting(false)} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      ) : isError || !data ? (
        <p className="py-10 text-center text-destructive">Failed to load reviews.</p>
      ) : (
        <>
          <ReviewSummary
            average={data.aggregate.average}
            count={data.aggregate.count}
            distribution={data.distribution}
          />

          {data.total > 0 && (
            <div className="flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">
                {data.total} review{data.total === 1 ? "" : "s"}
              </span>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as ReviewSort);
                    setPage(1);
                  }}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <ReviewList reviews={data.items} productId={productId} />

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
        </>
      )}
    </section>
  );
}
