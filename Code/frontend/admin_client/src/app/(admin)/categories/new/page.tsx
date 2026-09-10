"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CategoryForm } from "@/components/categories/CategoryForm";

export default function NewCategoryPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/categories"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> Back to categories
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold">New category</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A category is a landing page, not just a label — give it artwork and a
          line of copy and it will look deliberate on the storefront.
        </p>
      </div>

      <CategoryForm mode="create" />
    </div>
  );
}
