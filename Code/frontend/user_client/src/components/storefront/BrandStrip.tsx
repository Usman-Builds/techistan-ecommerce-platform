import Link from "next/link";
import Image from "next/image";
import type { ShowcaseBrand } from "@/lib/api/storefront";

/**
 * The brands the store stocks, as a quiet typographic strip.
 *
 * This is the block that answers "is this a real shop?" faster than any copy
 * can. It is deliberately the least decorated thing on the page: no cards, no
 * borders, no photographs — just names, set in the display face and letting the
 * black do the work. A logo wall competing with the product photography above
 * it would make both look cheaper.
 *
 * Logos are used when a brand has one and a WORDMARK when it does not, rather
 * than a grey placeholder box. Most catalogs have logo art for some brands and
 * not others, and a strip half-full of "no image" rectangles is worse than one
 * that is entirely type.
 *
 * Every name links into `/search?brand=<slug>`, which is a filter the search
 * page already understands — the strip is navigation, not decoration.
 */
export function BrandStrip({
  id,
  eyebrow,
  title,
  brands,
}: {
  id: string;
  eyebrow?: string;
  title?: string;
  brands: ShowcaseBrand[];
}) {
  // One lonely brand is not a roster. Below two the block says nothing.
  if (brands.length < 2) return null;

  return (
    <section
      aria-labelledby={id}
      className="border-border bg-card rounded-3xl border px-6 py-9 sm:px-10"
    >
      <div className="flex flex-col items-center gap-1.5 text-center">
        {eyebrow && <p className="text-primary eyebrow">{eyebrow}</p>}
        <h2 id={id} className="font-heading text-lg font-bold sm:text-xl">
          {title ?? "The brands we carry"}
        </h2>
      </div>

      <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-6 sm:gap-x-12">
        {brands.map((brand) => (
          <li key={brand.id}>
            <Link
              href={`/search?brand=${encodeURIComponent(brand.slug)}`}
              className="group focus-visible:ring-ring flex items-center gap-2 rounded-lg px-1 py-0.5 focus-visible:ring-2 focus-visible:outline-none"
              // The count is the useful half of this label: "Orbit, 6 products"
              // tells a screen-reader user what they are about to filter to.
              aria-label={`${brand.name}, ${brand.productCount} ${
                brand.productCount === 1 ? "product" : "products"
              }`}
            >
              {brand.logoUrl ? (
                <Image
                  src={brand.logoUrl}
                  alt=""
                  width={120}
                  height={32}
                  // Logos arrive in every colour and shape a supplier felt like
                  // sending. Held to one height and dimmed until hover, they at
                  // least behave as one set.
                  className="h-7 w-auto object-contain opacity-60 transition-opacity duration-200 group-hover:opacity-100"
                />
              ) : (
                <span
                  className="font-heading text-muted-foreground group-hover:text-primary text-lg font-semibold tracking-tight transition-colors duration-200 sm:text-xl"
                  aria-hidden
                >
                  {brand.name}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
