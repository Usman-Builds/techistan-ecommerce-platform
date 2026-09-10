import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, ImageOff, Package } from "lucide-react";
import { Stars } from "@/components/reviews/StarRating";
import { formatCents, formatPriceRange } from "@/lib/format";
import type { ProductDetail } from "@/lib/api/products";

/**
 * The editorial product feature — one product given a whole screen band.
 *
 * The homepage's other blocks all merchandise a SET (a rail, a grid, a strip).
 * This is the only one that argues for a single thing, which is what stops the
 * page reading as an inventory list: a shopper scrolling past six rails has
 * been shown ninety products and told nothing about any of them.
 *
 * Everything on it is real data — title, rating, price, and the first lines of
 * the product's own description. There is no separate "marketing copy" field to
 * fill in and no invented specification, so a spotlight can be pointed at any
 * product in the catalog and still be true.
 */
export function ProductSpotlight({
  id,
  eyebrow,
  title,
  subtitle,
  product,
  secondaryLabel,
  secondaryHref,
}: {
  id: string;
  eyebrow?: string;
  /** Overrides the product's own title when the merchant wants a headline. */
  title?: string;
  subtitle?: string;
  product: ProductDetail;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  const hero = product.images[0] ?? null;
  const href = `/products/${product.slug}`;
  const highlights = descriptionPoints(product.description);
  const saved = savings(product);

  return (
    <section
      aria-labelledby={id}
      className="border-border bg-card overflow-hidden rounded-3xl border"
    >
      <div className="grid items-stretch gap-0 lg:grid-cols-2">
        {/* Artwork first in the DOM on mobile, second on desktop: the picture is
         * the hook on a phone, the argument reads first on a wide screen. */}
        <div className="bg-muted relative order-1 aspect-[4/3] overflow-hidden lg:order-2 lg:aspect-auto lg:min-h-[26rem]">
          {hero ? (
            <Image
              src={hero.url}
              alt={hero.alt ?? product.title}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
              <ImageOff className="h-8 w-8" aria-hidden />
              <span className="text-xs">No image</span>
            </div>
          )}

          {saved != null && (
            <span className="bg-primary text-primary-foreground absolute top-4 left-4 rounded-full px-3 py-1.5 text-xs font-bold tracking-wide uppercase">
              Save {formatCents(saved)}
            </span>
          )}
        </div>

        <div className="order-2 flex flex-col justify-center gap-5 p-6 sm:p-10 lg:order-1 xl:p-14">
          {/* The panel is full-bleed but the argument inside it is not: capped
           * at a readable measure and left-aligned against the gutter, rather
           * than a headline stretched across half a 27" monitor. */}
          <div className="flex w-full max-w-2xl flex-col gap-5">
            <div className="space-y-2">
              {eyebrow && <p className="text-primary eyebrow">{eyebrow}</p>}

              <h2
                id={id}
                className="font-heading text-2xl leading-tight font-bold sm:text-3xl lg:text-4xl"
              >
                {title || product.title}
              </h2>

              {/* When the merchant supplied a headline, the product's real name
               * still has to appear — otherwise the block is an ad for something
               * unnamed. */}
              {title && title !== product.title && (
                <p className="text-muted-foreground text-sm">{product.title}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-heading text-2xl font-bold">
                {formatPriceRange(product.priceMin, product.priceMax)}
              </span>

              {product.rating.count > 0 && product.rating.average != null && (
                <span className="inline-flex items-center gap-2">
                  <Stars value={product.rating.average} size={15} />
                  <span className="text-muted-foreground text-sm">
                    {product.rating.average.toFixed(1)}
                    <span className="sr-only"> out of 5, from</span>{" "}
                    <span aria-hidden>·</span> {product.rating.count}
                    <span className="sr-only"> reviews</span>
                    <span aria-hidden> reviews</span>
                  </span>
                </span>
              )}
            </div>

            {subtitle && (
              <p className="text-muted-foreground max-w-prose text-sm leading-relaxed sm:text-base">
                {subtitle}
              </p>
            )}

            {highlights.length > 0 && (
              <ul className="space-y-2">
                {highlights.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm">
                    <Check
                      className="text-primary mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden
                    />
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href={href}
                className="bg-primary text-primary-foreground focus-visible:ring-ring focus-visible:ring-offset-card inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                View details
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>

              {secondaryHref && secondaryLabel && (
                <Link
                  href={secondaryHref}
                  className="border-border hover:border-primary/50 hover:text-primary focus-visible:ring-ring inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  {secondaryLabel}
                </Link>
              )}
            </div>

            {(product.brand || product.category) && (
              <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <Package className="h-3.5 w-3.5" aria-hidden />
                {product.brand && (
                  <Link
                    href={`/search?brand=${product.brand.slug}`}
                    className="hover:text-primary font-medium"
                  >
                    {product.brand.name}
                  </Link>
                )}
                {product.brand && product.category && (
                  <span aria-hidden>·</span>
                )}
                {product.category && (
                  <Link
                    href={`/c/${product.category.slug}`}
                    className="hover:text-primary font-medium"
                  >
                    {product.category.name}
                  </Link>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The first few sentences of the description, as bullets.
 *
 * Descriptions in this catalog are short paragraphs, not marketing bullets, so
 * they are split on sentence boundaries and capped — three tidy lines read as
 * specification, a wall of prose read as a page someone forgot to edit. Any
 * sentence too long to scan is dropped rather than truncated, because a bullet
 * ending in an ellipsis is worse than one fewer bullet.
 */
function descriptionPoints(description: string | null): string[] {
  if (!description) return [];
  return description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/[.]$/, ""))
    .filter((s) => s.length >= 12 && s.length <= 110)
    .slice(0, 3);
}

/**
 * The biggest per-variant saving, in cents, or null when nothing is on sale.
 *
 * Reported as an amount rather than a percentage because variants can discount
 * by different proportions, and "up to 40% off" next to one price is the kind
 * of claim that is technically true and reads as a trick.
 */
function savings(product: ProductDetail): number | null {
  if (!product.onSale) return null;
  const deltas = product.variants
    .filter((v) => v.onSale && v.saleCompareAt != null)
    .map((v) => v.saleCompareAt! - v.effectivePrice)
    .filter((d) => d > 0);
  return deltas.length ? Math.max(...deltas) : null;
}
