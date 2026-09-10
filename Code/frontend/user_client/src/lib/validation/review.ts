import { z } from "zod";

/**
 * Client-side review schema — MIRRORS the backend CreateReviewDto (rating 1–5,
 * bounded title/body, ≤3 photos) so the UI rejects what the server would; the
 * backend stays the source of truth (verified-purchase + one-per-product).
 */
export const reviewFormSchema = z.object({
  rating: z
    .number({ error: "Pick a star rating" })
    .int()
    .min(1, "Pick a star rating")
    .max(5),
  title: z.string().max(120, "Keep the title under 120 characters").optional(),
  body: z.string().max(4000, "Keep the review under 4000 characters").optional(),
  mediaIds: z.array(z.string()).max(3, "At most 3 photos").optional(),
});

export type ReviewFormValues = z.infer<typeof reviewFormSchema>;
