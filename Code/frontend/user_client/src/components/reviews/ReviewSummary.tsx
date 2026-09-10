"use client";

import { Stars } from "./StarRating";
import type { RatingDistribution } from "@/lib/api/reviews";

/**
 * Aggregate rating + per-star distribution bars (FR-703/705). `average` is null
 * when a product has no approved reviews yet.
 */
export function ReviewSummary({
  average,
  count,
  distribution,
}: {
  average: number | null;
  count: number;
  distribution: RatingDistribution;
}) {
  if (count === 0 || average === null) {
    return (
      <p className="text-sm text-muted-foreground">
        No reviews yet — be the first to review this product.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
      <div className="flex flex-col items-center gap-1">
        <span className="text-4xl font-bold tabular-nums">{average.toFixed(1)}</span>
        <Stars value={average} size={18} />
        <span className="text-xs text-muted-foreground">
          {count} review{count === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex-1 space-y-1.5">
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const n = distribution[String(star) as keyof RatingDistribution] ?? 0;
          const pct = count > 0 ? Math.round((n / count) * 100) : 0;
          return (
            <div key={star} className="flex items-center gap-2 text-xs">
              <span className="w-8 shrink-0 text-muted-foreground">{star}★</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                {n}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
