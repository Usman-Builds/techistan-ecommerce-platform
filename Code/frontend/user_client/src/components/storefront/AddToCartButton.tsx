"use client";

import { Check, Loader2, ShoppingCart } from "lucide-react";
import { useAddToCart } from "@/lib/api/hooks/cart";
import { cn } from "@/lib/utils";

/**
 * Reusable add-to-cart action (script 09). Variant-based, so it works for any
 * caller that has resolved a variant — used by the product detail page (script
 * 14). A successful add opens the drawer (handled in useAddToCart). Errors (e.g.
 * out of stock, 400 from the API) surface inline.
 */
export function AddToCartButton({
  variantId,
  quantity = 1,
  disabled = false,
  label = "Add to cart",
  className,
}: {
  variantId: string;
  quantity?: number;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const add = useAddToCart();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled || add.isPending}
        onClick={() => add.mutate({ variantId, quantity })}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50",
          className,
        )}
      >
        {add.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : add.isSuccess ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <ShoppingCart className="h-4 w-4" aria-hidden />
        )}
        {label}
      </button>
      {add.isError && (
        <p className="text-xs text-destructive" role="alert">
          {add.error instanceof Error ? add.error.message : "Could not add to cart."}
        </p>
      )}
    </div>
  );
}
