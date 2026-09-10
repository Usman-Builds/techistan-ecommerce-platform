import { ProductCard } from "@/components/search/ProductCard";
import { Reveal } from "./Reveal";
import type { ProductListItem } from "@/lib/api/products";

/**
 * Responsive product grid shared by the homepage, category listings, and related
 * rails (script 14). Maps the backend list-card shape onto the shared
 * {@link ProductCard}. Staggered motion-safe entrance via {@link Reveal}.
 */
export function ProductGrid({
  products,
  animate = true,
  showCategory = false,
}: {
  products: ProductListItem[];
  animate?: boolean;
  /** Show the category eyebrow — useful in mixed lists, noise on a category page. */
  showCategory?: boolean;
}) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => {
        const card = (
          <ProductCard
            product={{
              id: p.id,
              title: p.title,
              slug: p.slug,
              priceMin: p.priceMin,
              priceMax: p.priceMax,
              image: p.primaryImage,
              rating: p.rating,
              onSale: p.onSale,
              category: showCategory ? p.category : null,
            }}
          />
        );
        return (
          <li key={p.id} className="h-full">
            {animate ? (
              <Reveal index={i} className="h-full">
                {card}
              </Reveal>
            ) : (
              card
            )}
          </li>
        );
      })}
    </ul>
  );
}
