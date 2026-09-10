"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ProductForm } from "@/components/products/ProductForm";

export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> Back to products
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold">New product</h1>
      </div>
      <ProductForm mode="create" />
    </div>
  );
}
