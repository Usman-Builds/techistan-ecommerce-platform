"use client";

import Link from "next/link";
import { FolderTree, Plus } from "lucide-react";
import { CategoryManager } from "@/components/categories/CategoryManager";

export default function CategoriesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
            <FolderTree className="h-6 w-6" aria-hidden /> Categories
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The structure and order of the catalog. Open a category to edit its
            artwork, copy, SEO and visibility.
          </p>
        </div>
        <Link
          href="/categories/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden /> New category
        </Link>
      </div>

      <CategoryManager />
    </div>
  );
}
