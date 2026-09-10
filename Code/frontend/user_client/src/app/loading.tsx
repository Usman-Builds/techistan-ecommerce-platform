import { ProductGridSkeleton } from "@/components/storefront/ProductGridSkeleton";
import { PAGE_GUTTER } from "@/components/storefront/page-shell";
import { cn } from "@/lib/utils";

/**
 * Root loading skeleton shown while a route segment streams in (NFR-304).
 *
 * Uses the same full-bleed gutter as the homepage it stands in for. It used to
 * be capped at a centred 1280px column, which meant the skeleton and the real
 * page were different widths — so every visit to the home page ended with the
 * content visibly jumping outwards as it resolved.
 */
export default function Loading() {
  return (
    <div className={cn("space-y-8 py-10", PAGE_GUTTER)}>
      <div className="bg-muted h-8 w-56 animate-pulse rounded" />
      <ProductGridSkeleton count={8} />
    </div>
  );
}
