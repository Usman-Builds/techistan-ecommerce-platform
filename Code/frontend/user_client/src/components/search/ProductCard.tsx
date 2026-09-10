import Link from "next/link";
import Image from "next/image";
import { ImageOff, Star } from "lucide-react";
import { formatPriceRange } from "@/lib/format";
import { renderHighlight } from "@/lib/search-highlight";
import { WishlistButton } from "@/components/storefront/WishlistButton";
import { cn } from "@/lib/utils";

/**
 * Shared storefront product card (script 08; reused by the storefront in
 * script 14). Renders a Cloudinary image via the custom next/image loader, price
 * range, optional rating, and optional ts_headline highlight snippets. Links to
 * the product detail page (`/products/[slug]`).
 */
export interface ProductCardData {
  /** Product id — when present, a wishlist heart is shown (script 09). */
  id?: string;
  title: string;
  slug: string;
  priceMin: number | null;
  priceMax: number | null;
  image: { url: string; alt: string | null } | null;
  rating?: { average: number | null; count: number } | null;
  highlight?: { title: string | null; description: string | null } | null;
  /** Sale-active (any variant). Drives the Sale badge. */
  onSale?: boolean;
  /** Category label shown as a small eyebrow — adds context in mixed rails. */
  category?: { name: string; slug: string } | null;
}

export function ProductCard({
  product,
  className,
}: {
  product: ProductCardData;
  className?: string;
}) {
  const titleNode = product.highlight?.title
    ? renderHighlight(product.highlight.title)
    : product.title;

  return (
    <Link
      href={`/products/${product.slug}`}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow duration-200 hover:border-primary/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.alt ?? product.title}
            fill
            sizes="(max-width: 640px) 60vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <ImageOff className="h-6 w-6" aria-hidden />
            <span className="text-xs">No image</span>
          </div>
        )}

        {/* Sale flag. The word "Sale" carries the meaning; the brand gold is
         * reinforcement, never the sole signal. It used to be its own orange —
         * one more hue on a page that already had six. */}
        {product.onSale && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
            Sale
          </span>
        )}

        {product.id && (
          <div className="absolute right-2 top-2">
            <WishlistButton productId={product.id} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3.5">
        {product.category && (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {product.category.name}
          </span>
        )}

        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
          {titleNode}
        </h3>

        {product.highlight?.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {renderHighlight(product.highlight.description)}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-sm font-bold text-foreground">
            {formatPriceRange(product.priceMin, product.priceMax)}
          </span>
          {product.rating && product.rating.count > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
              <Star className="h-3 w-3 fill-primary text-primary" aria-hidden />
              {product.rating.average?.toFixed(1)}
              <span className="sr-only">average rating from</span>
              <span aria-hidden>({product.rating.count})</span>
              <span className="sr-only">{product.rating.count} reviews</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
