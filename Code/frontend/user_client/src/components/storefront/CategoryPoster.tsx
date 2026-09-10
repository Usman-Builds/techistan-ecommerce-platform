import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Rail } from "./Rail";
import { SectionHeading } from "./SectionHeading";
import { categoryVisual } from "./category-visuals";
import type { CategoryTreeNode } from "@/lib/api/categories";
import { cn } from "@/lib/utils";

/**
 * Photographic category poster: a real product photo (seeded on
 * `Category.imageUrl`) under a scrim, with the category's own icon chip and name
 * on top.
 *
 * The tint that used to wash each poster in its own accent hue is gone — 19
 * categories meant 19 differently-coloured tiles in one rail, which fought both
 * each other and the photographs underneath. The photos supply the colour; the
 * chrome is black, white and one gold.
 *
 * A category with no image is NOT a broken tile: it falls back to a solid brand
 * panel with the icon watermarked large, so a freshly-created category still
 * looks deliberate. That matters because `imageUrl` is optional in the schema and
 * admins routinely create a category before uploading art for it.
 */
export function CategoryPosterCard({
  category,
  size = "md",
}: {
  category: Pick<CategoryTreeNode, "name" | "slug" | "imageUrl"> & {
    /** The admin's chosen icon, when this came from the tree. */
    iconKey?: string | null;
    children?: CategoryTreeNode[];
  };
  size?: "sm" | "md" | "lg";
}) {
  const { icon: Icon } = categoryVisual(
    category.slug,
    category.name,
    category.iconKey,
  );
  const childCount = category.children?.length ?? 0;

  const aspect =
    size === "lg"
      ? "aspect-4/5"
      : size === "sm"
        ? "aspect-square"
        : "aspect-3/4";

  return (
    <Link
      href={`/c/${category.slug}`}
      className={cn(
        "group relative flex overflow-hidden rounded-2xl border border-border bg-primary transition-shadow duration-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        aspect,
      )}
    >
      {category.imageUrl ? (
        <>
          <Image
            src={category.imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {/* Flat scrim. Strong enough at the foot of the tile to guarantee the
           * label's contrast whatever the photo does down there. */}
          <span className="absolute inset-0 bg-black/45" aria-hidden />
          <span className="absolute inset-x-0 bottom-0 h-2/5 bg-black/45" aria-hidden />
        </>
      ) : (
        <Icon
          className="pointer-events-none absolute -bottom-4 -right-4 h-28 w-28 text-white/20"
          aria-hidden
        />
      )}

      <span
        className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur"
        aria-hidden
      >
        <Icon className="h-4.5 w-4.5" />
      </span>

      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3.5">
        <span className="min-w-0">
          <span className="poster-text block truncate font-heading text-base font-bold text-white">
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

/** Swipable row of category posters. */
export function CategoryPosterRail({
  id,
  title,
  eyebrow,
  categories,
  href,
}: {
  id: string;
  title: string;
  eyebrow?: string;
  categories: CategoryTreeNode[];
  href?: string;
}) {
  if (categories.length === 0) return null;

  return (
    <section aria-labelledby={id} className="space-y-5">
      <SectionHeading
        id={id}
        title={title}
        eyebrow={eyebrow}
        href={href}
        linkLabel="All categories"
      />
      <Rail
        ariaLabel={title}
        itemClassName="w-[42vw] max-w-[13rem] sm:w-48 lg:w-52"
      >
        {categories.map((c) => (
          <CategoryPosterCard key={c.id} category={c} />
        ))}
      </Rail>
    </section>
  );
}
