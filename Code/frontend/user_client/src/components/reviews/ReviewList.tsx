"use client";

import { useState } from "react";
import { ThumbsUp, Loader2, X } from "lucide-react";
import { Stars } from "./StarRating";
import { useVoteHelpful } from "@/lib/api/hooks/reviews";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";
import type { PublicReview } from "@/lib/api/reviews";

/** Approved-review list with photo thumbnails, a lightbox, and helpful voting. */
export function ReviewList({
  reviews,
  productId,
}: {
  reviews: PublicReview[];
  productId: string;
}) {
  const [lightbox, setLightbox] = useState<{ url: string; alt: string | null } | null>(null);

  if (reviews.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No reviews on this page.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {reviews.map((r) => (
          <ReviewRow
            key={r.id}
            review={r}
            productId={productId}
            onOpenPhoto={setLightbox}
          />
        ))}
      </ul>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.alt ?? "Review photo"}
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function ReviewRow({
  review,
  productId,
  onOpenPhoto,
}: {
  review: PublicReview;
  productId: string;
  onOpenPhoto: (photo: { url: string; alt: string | null }) => void;
}) {
  const { isAuthenticated } = useAuth();
  const vote = useVoteHelpful(productId);
  const voted = review.votedByMe;

  return (
    <li className="py-5">
      <div className="flex items-center justify-between gap-3">
        <Stars value={review.rating} size={15} />
        <time className="text-xs text-muted-foreground" dateTime={review.createdAt}>
          {new Date(review.createdAt).toLocaleDateString()}
        </time>
      </div>

      {review.title && (
        <h4 className="mt-2 font-medium text-foreground">{review.title}</h4>
      )}
      {review.body && (
        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
          {review.body}
        </p>
      )}

      {review.images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {review.images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => onOpenPhoto(img)}
              className="h-16 w-16 overflow-hidden rounded-md border border-border"
              aria-label="View review photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt ?? "Review photo"}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span>By {review.author}</span>
        <button
          type="button"
          disabled={!isAuthenticated || voted || vote.isPending}
          onClick={() => vote.mutate(review.id)}
          title={
            !isAuthenticated
              ? "Sign in to vote"
              : voted
                ? "You marked this helpful"
                : "Mark this review helpful"
          }
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors",
            voted
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border hover:bg-muted disabled:opacity-50",
          )}
        >
          {vote.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
          )}
          Helpful ({review.helpfulCount})
        </button>
      </div>
    </li>
  );
}
