"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Stars } from "@/components/reviews/StarRating";
import { AddToCartButton } from "./AddToCartButton";
import { WishlistButton } from "./WishlistButton";
import { formatMoney } from "@/lib/utils/money";
import { useRecordProductView } from "@/lib/recently-viewed";
import { cn } from "@/lib/utils";
import type { ProductDetail, ProductVariant } from "@/lib/api/products";

/**
 * PDP buy-box (script 14). Derives option axes from the variants, renders a
 * stock-aware variant selector (values with no in-stock combination are
 * disabled), sale-aware pricing (effective price + struck compare-at + Sale
 * badge), a quantity stepper clamped to stock, add-to-cart, and wishlist. Fires
 * a best-effort recently-viewed record on mount.
 */
export function ProductPurchasePanel({
  product,
  currency,
}: {
  product: ProductDetail;
  currency: string;
}) {
  useRecordProductView(product.id);

  const variants = product.variants;

  // Ordered option axes (union of variant option keys, first-seen order).
  const axes = useMemo(() => {
    const seen: string[] = [];
    for (const v of variants) {
      for (const key of Object.keys(v.options ?? {})) {
        if (!seen.includes(key)) seen.push(key);
      }
    }
    return seen;
  }, [variants]);

  // Values per axis (first-seen order).
  const valuesByAxis = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const axis of axes) {
      const vals: string[] = [];
      for (const v of variants) {
        const val = v.options?.[axis];
        if (val && !vals.includes(val)) vals.push(val);
      }
      map[axis] = vals;
    }
    return map;
  }, [axes, variants]);

  // Initial selection: options of the first in-stock variant, else first variant.
  const [selection, setSelection] = useState<Record<string, string>>(() => {
    const preferred = variants.find((v) => v.stock > 0) ?? variants[0];
    return { ...(preferred?.options ?? {}) };
  });

  const selectedVariant: ProductVariant | undefined = useMemo(() => {
    if (variants.length === 0) return undefined;
    if (axes.length === 0) return variants[0];
    return variants.find((v) =>
      axes.every((axis) => v.options?.[axis] === selection[axis]),
    );
  }, [variants, axes, selection]);

  // A value is available if some variant matching the OTHER selected axes has it
  // in stock.
  const isValueAvailable = (axis: string, value: string) =>
    variants.some(
      (v) =>
        v.stock > 0 &&
        v.options?.[axis] === value &&
        axes.every(
          (other) => other === axis || v.options?.[other] === selection[other],
        ),
    );

  const [quantity, setQuantity] = useState(1);
  const maxQty = Math.min(selectedVariant?.stock ?? 0, 10);
  const clampedQty = Math.max(1, Math.min(quantity, Math.max(1, maxQty)));

  const outOfStock = !selectedVariant || selectedVariant.stock <= 0;
  const price = selectedVariant?.effectivePrice ?? product.priceMin;
  const compareAt = selectedVariant?.saleCompareAt ?? null;
  const onSale = selectedVariant?.onSale ?? false;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {product.brand && (
          <p className="text-sm font-medium text-muted-foreground">
            {product.brand.name}
          </p>
        )}
        <h1 className="font-heading text-3xl font-bold">{product.title}</h1>
        <div className="flex items-center gap-2">
          {product.rating.average !== null ? (
            <>
              <Stars value={product.rating.average} size={16} />
              <span className="text-sm text-muted-foreground">
                {product.rating.average.toFixed(1)} ({product.rating.count})
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">No ratings yet</span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold text-foreground">
          {price != null ? formatMoney(price, currency) : "—"}
        </span>
        {onSale && compareAt != null && (
          <>
            <span className="text-lg text-muted-foreground line-through">
              {formatMoney(compareAt, currency)}
            </span>
            <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-white">
              Sale
            </span>
          </>
        )}
      </div>

      {/* Variant axes */}
      {axes.map((axis) => (
        <fieldset key={axis} className="space-y-2">
          <legend className="text-sm font-medium">
            {axis}
            {selection[axis] && (
              <span className="ml-1 text-muted-foreground">— {selection[axis]}</span>
            )}
          </legend>
          <div className="flex flex-wrap gap-2">
            {valuesByAxis[axis].map((value) => {
              const selected = selection[axis] === value;
              const available = isValueAvailable(axis, value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setSelection((s) => ({ ...s, [axis]: value }));
                    setQuantity(1);
                  }}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card hover:bg-muted",
                    !available && !selected && "opacity-40",
                  )}
                >
                  {value}
                  {!available && !selected && (
                    <span className="sr-only"> (out of stock)</span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {/* Stock hint */}
      <p className="text-sm" aria-live="polite">
        {outOfStock ? (
          <span className="font-medium text-destructive">Out of stock</span>
        ) : selectedVariant && selectedVariant.stock <= 5 ? (
          <span className="font-medium text-warning">
            Only {selectedVariant.stock} left
          </span>
        ) : (
          <span className="text-success">In stock</span>
        )}
      </p>

      {/* Quantity + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-md border border-border">
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={outOfStock || clampedQty <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="grid h-10 w-10 place-items-center rounded-l-md hover:bg-muted disabled:opacity-40"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span className="w-10 text-center text-sm font-medium" aria-live="polite">
            {clampedQty}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={outOfStock || clampedQty >= maxQty}
            onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
            className="grid h-10 w-10 place-items-center rounded-r-md hover:bg-muted disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <AddToCartButton
          variantId={selectedVariant?.id ?? ""}
          quantity={clampedQty}
          disabled={outOfStock || !selectedVariant}
          label={outOfStock ? "Out of stock" : "Add to cart"}
          className="flex-1 min-w-40"
        />

        <WishlistButton productId={product.id} className="h-11 w-11" />
      </div>
    </div>
  );
}
