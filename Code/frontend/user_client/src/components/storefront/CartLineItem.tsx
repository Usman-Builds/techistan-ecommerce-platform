"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2, AlertTriangle } from "lucide-react";
import type { CartLine } from "@/lib/api/cart";
import { formatCents } from "@/lib/format";
import { useRemoveCartItem, useUpdateCartItem } from "@/lib/api/hooks/cart";
import { QuantityStepper } from "./QuantityStepper";

/**
 * A single cart line (script 09). Shared by the CartDrawer and the /cart page.
 * Quantity changes / removal go through the cart mutation hooks; per-line stock
 * signals (`clamped` / `outOfStock`) from the API are surfaced so the shopper
 * sees issues before checkout (FR-303).
 */
export function CartLineItem({
  line,
  compact = false,
}: {
  line: CartLine;
  compact?: boolean;
}) {
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const busy = update.isPending || remove.isPending;

  const optionText = Object.entries(line.options)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");

  return (
    <div className="flex gap-3 py-4">
      <Link
        href={`/products/${line.slug}`}
        className="relative aspect-square w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
      >
        {line.image ? (
          <Image
            src={line.image.url}
            alt={line.image.alt ?? line.title}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <span className="grid h-full place-items-center text-[10px] text-muted-foreground">
            No image
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/products/${line.slug}`}
            className="line-clamp-2 text-sm font-medium text-foreground hover:underline"
          >
            {line.title}
          </Link>
          <button
            type="button"
            aria-label={`Remove ${line.title}`}
            disabled={busy}
            onClick={() => remove.mutate(line.id)}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {optionText && (
          <p className="text-xs text-muted-foreground">{optionText}</p>
        )}

        {line.availability.outOfStock ? (
          <p className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3 w-3" aria-hidden /> Out of stock
          </p>
        ) : line.availability.clamped ? (
          <p className="inline-flex items-center gap-1 text-xs text-warning">
            <AlertTriangle className="h-3 w-3" aria-hidden /> Only{" "}
            {line.availability.available} left — quantity adjusted
          </p>
        ) : null}

        <div className="mt-1 flex items-center justify-between gap-2">
          <QuantityStepper
            value={line.quantity}
            max={line.availability.available || 1}
            disabled={busy || line.availability.outOfStock}
            onChange={(next) =>
              update.mutate({ itemId: line.id, quantity: next })
            }
          />
          <div className="text-right">
            <div className="text-sm font-semibold text-foreground">
              {formatCents(line.lineSubtotal)}
            </div>
            {!compact && line.quantity > 1 && (
              <div className="text-xs text-muted-foreground">
                {formatCents(line.unitPrice)} each
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
