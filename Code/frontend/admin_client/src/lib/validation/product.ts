import { z } from "zod";

/**
 * Scalar/SEO fields of the product editor (react-hook-form + Zod, per script 01).
 * Variants, tags, and images are managed by dedicated stateful sub-components and
 * merged in on submit — the backend remains the source of truth for the ≤3-axes /
 * ≤100-combination rules (script 07 Task 5).
 */
export const productFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(300),
  slug: z
    .string()
    .max(220)
    .regex(/^$|^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens")
    .optional(),
  description: z.string().max(20000).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  categoryId: z.string().optional().nullable(),
  metaTitle: z.string().max(180).optional(),
  metaDescription: z.string().max(400).optional(),
  ogImage: z.string().max(500).optional(),
  canonicalUrl: z
    .string()
    .max(500)
    .refine((v) => !v || /^https?:\/\//.test(v), "Must be an absolute URL")
    .optional(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
