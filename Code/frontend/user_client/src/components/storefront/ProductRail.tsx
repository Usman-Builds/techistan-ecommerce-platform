import type { LucideIcon } from "lucide-react";
import { ProductCard } from "@/components/search/ProductCard";
import { Rail } from "./Rail";
import { SectionHeading } from "./SectionHeading";
import type { ProductListItem } from "@/lib/api/products";

/**
 * A titled, swipable row of products — the homepage's main merchandising unit.
 *
 * Server Component: it renders the cards itself and passes them as children into
 * the client-side {@link Rail}, so only the ~2KB of scroll logic ships to the
 * browser while the cards (and their images) stay server-rendered and indexable.
 *
 * Renders nothing at all when the list is empty. A rail is a curated slice
 * ("On sale", "New arrivals") — an empty one is a merchandising fact, not an
 * error, and an empty-state box for each would leave the page full of apologies.
 */
export function ProductRail({
  id,
  title,
  eyebrow,
  icon,
  href,
  linkLabel,
  products,
  showCategory = true,
}: {
  /** Used for the heading id ↔ section aria-labelledby pairing. */
  id: string;
  title: string;
  eyebrow?: string;
  icon?: LucideIcon;
  href?: string;
  linkLabel?: string;
  products: ProductListItem[];
  showCategory?: boolean;
}) {
  if (products.length === 0) return null;

  return (
    <section aria-labelledby={id} className="space-y-5">
      <SectionHeading
        id={id}
        title={title}
        eyebrow={eyebrow}
        icon={icon}
        href={href}
        linkLabel={linkLabel}
      />

      <Rail
        ariaLabel={title}
        itemClassName="w-[58vw] max-w-[17rem] sm:w-64 lg:w-[17.5rem]"
      >
        {products.map((p) => (
          <ProductCard
            key={p.id}
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
        ))}
      </Rail>
    </section>
  );
}
