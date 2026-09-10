"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CheckCircle2 } from "lucide-react";
import { StarInput } from "./StarRating";
import { ReviewPhotoUploader } from "./ReviewPhotoUploader";
import { useCreateReview } from "@/lib/api/hooks/reviews";
import { reviewFormSchema, type ReviewFormValues } from "@/lib/validation/review";
import { ApiError } from "@/lib/api/client";

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Write-a-review form (script 13, FR-701). Mirrors CreateReviewDto; the backend
 * remains the source of truth for the verified-purchase (403) and one-per-product
 * (409) rules, which are surfaced here. A submitted review is PENDING moderation.
 */
export function WriteReviewForm({
  productId,
  onDone,
}: {
  productId: string;
  onDone?: () => void;
}) {
  const create = useCreateReview(productId);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: { rating: 0, title: "", body: "", mediaIds: [] },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await create.mutateAsync({
        productId,
        rating: values.rating,
        title: values.title?.trim() || undefined,
        body: values.body?.trim() || undefined,
        mediaIds: values.mediaIds?.length ? values.mediaIds : undefined,
      });
      setSubmitted(true);
      onDone?.();
    } catch (err) {
      // Surface the backend's specific reasons (FR-701).
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setServerError("You can review this only after your order is delivered.");
        } else if (err.status === 409) {
          setServerError("You've already reviewed this product.");
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError("Something went wrong — please try again.");
      }
    }
  });

  if (submitted) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden />
        <div>
          <p className="font-medium">Thanks for your review!</p>
          <p className="text-sm text-muted-foreground">
            It&apos;s awaiting moderation and will appear once approved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Your rating</label>
        <Controller
          control={control}
          name="rating"
          render={({ field }) => (
            <StarInput value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.rating && (
          <p className="mt-1 text-xs text-destructive">{errors.rating.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Title (optional)</label>
        <input {...register("title")} className={inputCls} placeholder="Sum it up" />
        {errors.title && (
          <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Review (optional)</label>
        <textarea
          {...register("body")}
          rows={4}
          className={inputCls}
          placeholder="What did you think?"
        />
        {errors.body && (
          <p className="mt-1 text-xs text-destructive">{errors.body.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Photos (optional, up to 3)</label>
        <ReviewPhotoUploader
          onChange={(ids) => setValue("mediaIds", ids, { shouldValidate: true })}
        />
        {errors.mediaIds && (
          <p className="mt-1 text-xs text-destructive">{errors.mediaIds.message}</p>
        )}
      </div>

      {serverError && (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={create.isPending}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Submit review
      </button>
    </form>
  );
}
