"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, ExternalLink, Loader2 } from "lucide-react";
import { useAdminCategory } from "@/lib/api/hooks/categories";
import { CategoryForm } from "@/components/categories/CategoryForm";

const STOREFRONT_URL =
  process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "http://localhost:3001";

export default function EditCategoryPage() {
  const params = useParams<{ id: string }>();
  const { data: category, isLoading, isError } = useAdminCategory(params.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/categories"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> Back to categories
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold">
              {category ? category.name : "Edit category"}
            </h1>
            {category?.parent && (
              <p className="text-sm text-muted-foreground">
                Inside{" "}
                <Link
                  href={`/categories/${category.parent.id}`}
                  className="text-primary hover:underline"
                >
                  {category.parent.name}
                </Link>
              </p>
            )}
          </div>
          {category && (
            <a
              href={`${STOREFRONT_URL}/c/${category.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              View on storefront
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : isError || !category ? (
        <p className="py-12 text-sm text-destructive">
          Could not load this category.
        </p>
      ) : (
        // key forces a fresh form instance when navigating between categories
        <CategoryForm key={category.id} mode="edit" category={category} />
      )}
    </div>
  );
}
