"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useAdminProduct } from "@/lib/api/hooks/products";
import { ProductForm } from "@/components/products/ProductForm";

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: product, isLoading, isError } = useAdminProduct(id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> Back to products
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold">
          {product ? product.title : "Edit product"}
        </h1>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : isError || !product ? (
        <p className="py-12 text-sm text-destructive">
          Could not load this product.
        </p>
      ) : (
        // key forces a fresh form instance when navigating between products
        <ProductForm key={product.id} mode="edit" product={product} />
      )}
    </div>
  );
}
