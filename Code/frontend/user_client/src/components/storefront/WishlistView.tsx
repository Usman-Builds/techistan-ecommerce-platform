"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart, Loader2, ShoppingCart, Trash2 } from "lucide-react";
import { formatPriceRange } from "@/lib/format";
import {
  useMoveToCart,
  useRemoveFromWishlist,
  useWishlist,
} from "@/lib/api/hooks/cart";

/**
 * Wishlist page body (script 09, FR-307). Lists saved products with move-to-cart
 * (adds the cheapest in-stock variant server-side, then drops it here) and
 * remove. Functional now; script 14 refines the styling.
 */
export function WishlistView() {
  const { data: items, isPending } = useWishlist();

  if (isPending) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="py-24 text-center">
        <Heart className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 font-heading text-2xl font-bold">
          Your wishlist is empty
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap the heart on any product to save it here.
        </p>
        <Link
          href="/search"
          className="mt-6 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <li
          key={p.id}
          className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
        >
          <Link
            href={`/products/${p.slug}`}
            className="relative aspect-square overflow-hidden bg-muted"
          >
            {p.primaryImage ? (
              <Image
                src={p.primaryImage.url}
                alt={p.primaryImage.alt ?? p.title}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-cover"
              />
            ) : (
              <span className="grid h-full place-items-center text-xs text-muted-foreground">
                No image
              </span>
            )}
          </Link>
          <div className="flex flex-1 flex-col gap-2 p-3">
            <Link
              href={`/products/${p.slug}`}
              className="line-clamp-2 text-sm font-medium hover:underline"
            >
              {p.title}
            </Link>
            <span className="text-sm font-semibold">
              {formatPriceRange(p.priceMin, p.priceMax)}
            </span>
            <div className="mt-auto flex items-center gap-2">
              <MoveButton productId={p.id} />
              <RemoveButton productId={p.id} title={p.title} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MoveButton({ productId }: { productId: string }) {
  const move = useMoveToCart();
  return (
    <button
      type="button"
      onClick={() => move.mutate(productId)}
      disabled={move.isPending}
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
    >
      {move.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
      )}
      Move to cart
    </button>
  );
}

function RemoveButton({
  productId,
  title,
}: {
  productId: string;
  title: string;
}) {
  const remove = useRemoveFromWishlist();
  return (
    <button
      type="button"
      aria-label={`Remove ${title} from wishlist`}
      onClick={() => remove.mutate(productId)}
      disabled={remove.isPending}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
