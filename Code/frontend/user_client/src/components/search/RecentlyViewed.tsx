"use client";

import { useRecentlyViewed } from "@/lib/api/hooks/search";
import { ProductCard } from "./ProductCard";

/**
 * Recently-viewed strip (FR-224). Reads `GET /recently-viewed`, which resolves
 * per-account for signed-in customers and per-cookie for guests. Renders nothing
 * until there is something to show.
 */
export function RecentlyViewed() {
  const { data = [], isLoading } = useRecentlyViewed();

  if (isLoading || data.length === 0) return null;

  return (
    <section aria-labelledby="recently-viewed-heading" className="space-y-3">
      <h2
        id="recently-viewed-heading"
        className="font-heading text-lg font-semibold"
      >
        Recently viewed
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {data.map((p) => (
          <ProductCard
            key={p.id}
            product={{
              title: p.title,
              slug: p.slug,
              priceMin: p.priceMin,
              priceMax: p.priceMax,
              image: p.primaryImage,
            }}
          />
        ))}
      </div>
    </section>
  );
}
