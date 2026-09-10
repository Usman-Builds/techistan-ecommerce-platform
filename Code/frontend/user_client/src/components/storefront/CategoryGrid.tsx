import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { categoryVisual } from "./category-visuals";
import type { CategoryTreeNode } from "@/lib/api/categories";
import { cn } from "@/lib/utils";

/**
 * Categories as a mosaic rather than a swipable row.
 *
 * The horizontal `CategoryPosterRail` still exists and is still the right block
 * for a store with thirty collections. This one is for the top of the page,
 * where a rail has two problems: everything past the third tile is off-screen
 * and undiscovered on desktop, and a row of identical posters carries no sense
 * of what the store is mainly about.
 *
 * The grid fixes both by giving the LEAD category a tile four times the size of
 * the rest. That is a merchandising statement — "this is what we sell" — made
 * with layout rather than with a banner someone has to write.
 *
 * Ordering comes from the tree, which the admin already controls via each
 * category's `sortOrder`, so the big tile is chosen in the place where category
 * priority is already decided.
 */
export function CategoryGrid({
  id,
  eyebrow,
  title,
  subtitle,
  categories,
  href,
  linkLabel,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  categories: CategoryTreeNode[];
  href?: string;
  linkLabel?: string;
}) {
  if (categories.length === 0) return null;

  const [lead, ...rest] = categories;
  const wideTail = rest.length % 2 === 1;

  return (
    <section aria-labelledby={id} className="space-y-5">
      <SectionHeading
        id={id}
        eyebrow={eyebrow}
        title={title}
        href={href}
        linkLabel={linkLabel}
      />

      {subtitle && (
        <p className="text-muted-foreground -mt-2 max-w-2xl text-sm">
          {subtitle}
        </p>
      )}

      {/* The grid adapts to how many categories there actually are, because a
       * mosaic with a half-empty final row looks like a rendering bug rather
       * than a layout. See `fillsExactly` and `wideTail`. */}
      <div
        className={cn(
          "grid auto-rows-[9.5rem] grid-cols-2 gap-3 sm:auto-rows-[10.5rem] sm:grid-cols-3",
          fillsExactly(categories.length, 4)
            ? "lg:grid-cols-4"
            : "lg:grid-cols-3",
        )}
      >
        <Tile category={lead} className="col-span-2 row-span-2" size="lg" />
        {rest.map((category, index) => (
          <Tile
            key={category.id}
            category={category}
            // Two columns on a phone means an odd number of small tiles ends on
            // a half-empty row. The last one stretches across instead.
            className={
              wideTail && index === rest.length - 1
                ? "col-span-2 sm:col-span-1"
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

function Tile({
  category,
  className,
  size = "sm",
}: {
  category: CategoryTreeNode;
  className?: string;
  size?: "sm" | "lg";
}) {
  const { icon: Icon } = categoryVisual(
    category.slug,
    category.name,
    category.iconKey,
  );
  const childCount = category.children?.length ?? 0;

  return (
    <Link
      href={`/c/${category.slug}`}
      className={cn(
        "group border-border bg-primary focus-visible:ring-ring relative overflow-hidden rounded-2xl border transition-shadow duration-200 hover:shadow-lg focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
    >
      {category.imageUrl ? (
        <>
          <Image
            src={category.imageUrl}
            alt=""
            fill
            sizes={
              size === "lg"
                ? "(max-width: 640px) 100vw, 50vw"
                : "(max-width: 640px) 50vw, 25vw"
            }
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span className="absolute inset-0 bg-black/45" aria-hidden />
          <span
            className="absolute inset-x-0 bottom-0 h-1/2 bg-black/45"
            aria-hidden
          />
        </>
      ) : (
        <Icon
          className={cn(
            "pointer-events-none absolute -right-4 -bottom-4 text-white/20",
            size === "lg" ? "h-48 w-48" : "h-28 w-28",
          )}
          aria-hidden
        />
      )}

      <span
        className="absolute top-3 left-3 grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur"
        aria-hidden
      >
        <Icon className="h-4.5 w-4.5" />
      </span>

      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
        <span className="min-w-0">
          <span
            className={cn(
              "poster-text font-heading block truncate font-bold text-white",
              size === "lg" ? "text-xl sm:text-2xl" : "text-base",
            )}
          >
            {category.name}
          </span>
          {childCount > 0 && (
            <span className="poster-text block text-xs text-white/75">
              {childCount} {childCount === 1 ? "collection" : "collections"}
            </span>
          )}
        </span>
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100"
          aria-hidden
        >
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </span>
    </Link>
  );
}

/**
 * Does `count` tiles — one 2x2 lead plus the rest 1x1 — fill a `columns`-wide
 * grid with no hole in the last row?
 *
 * The lead eats two cells from each of the first two rows, so `2 * (columns-2)`
 * small tiles sit beside it and everything after that has to be a whole number
 * of full rows.
 *
 * This is what decides the desktop column count: six top-level categories tile
 * perfectly at three columns and leave three empty cells at four, so the grid
 * simply stays three wide. Choosing between two static class names beats
 * computing a grid-template at runtime, which Tailwind could not see to
 * generate.
 */
export function fillsExactly(count: number, columns: number): boolean {
  const beside = 2 * (columns - 2);
  const remaining = count - 1 - beside;
  return remaining >= 0 && remaining % columns === 0;
}
