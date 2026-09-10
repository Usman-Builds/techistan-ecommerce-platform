import type { CategoryTreeNode } from "@/lib/api/categories";
import {
  getProductBySlugServer,
  listProductsServer,
  type ProductDetail,
  type ProductListItem,
  type ProductSort,
} from "@/lib/api/products";
import type {
  HomepageSection,
  ManagedHeroSlide,
  ProductSource,
} from "@/lib/api/storefront";

/** Ceiling for the built-in "great value" rail. Integer cents, like every price. */
export const VALUE_CEILING = 10_000;
const RAIL_SIZE = 12;

/**
 * A CEILING on the category mosaic, not a target. Nine tiles (a 2x2 lead plus
 * eight singles) fill the grid exactly at 2, 3 and 4 columns; a store with
 * fewer top-level categories than that is the common case, and `CategoryGrid`
 * picks its own column count so any smaller number still tiles cleanly.
 */
export const GRID_SIZE = 9;

/** Six quotes — two full rows of three on desktop, three of two on tablet. */
export const TESTIMONIAL_COUNT = 6;

/**
 * The layout an UNCONFIGURED store gets, expressed as sections.
 *
 * This is deliberately the same shape the admin builder produces, and mirrors
 * the backend's seed list, so both paths run through one renderer. TRUST_BAR is
 * absent from both: the block type still exists for a merchant who wants it,
 * but it is not what an unconfigured store leads with. Writing the
 * default as data rather than as a second JSX tree is what stops the two from
 * drifting: there is no "the fallback looks different from the seeded layout"
 * failure mode, because there is only one renderer.
 */
export function defaultSections(): HomepageSection[] {
  const section = (
    id: string,
    type: HomepageSection["type"],
    extra: Partial<HomepageSection> = {},
  ): HomepageSection => ({
    id,
    type,
    eyebrow: null,
    title: null,
    subtitle: null,
    href: null,
    linkLabel: null,
    config: null,
    sortOrder: 0,
    enabled: true,
    ...extra,
  });

  return [
    section("d-hero", "HERO"),
    section("d-categories", "CATEGORY_GRID", {
      eyebrow: "Browse the store",
      title: "Shop by category",
      subtitle:
        "Nineteen collections, from flagship laptops to the cable you forgot to buy.",
      href: "/search",
      linkLabel: "All categories",
      config: { limit: GRID_SIZE },
    }),
    section("d-featured", "PRODUCT_RAIL", {
      eyebrow: "Hand-picked",
      title: "Featured this week",
      href: "/search",
      config: { source: "FEATURED", limit: RAIL_SIZE, icon: "Star" },
    }),
    section("d-spotlight", "SPOTLIGHT", {
      eyebrow: "In the spotlight",
      config: { secondaryLabel: "See all featured", secondaryHref: "/search" },
    }),
    section("d-deals", "PRODUCT_RAIL", {
      eyebrow: "Limited time",
      title: "Deals worth grabbing",
      href: "/deals",
      linkLabel: "All deals",
      config: { source: "ON_SALE", limit: RAIL_SIZE, icon: "BadgePercent" },
    }),
    section("d-promos", "PROMO_TILES", { config: { limit: 3 } }),
    section("d-new", "PRODUCT_RAIL", {
      eyebrow: "Fresh in",
      title: "New arrivals",
      href: "/search?sort=newest",
      config: { source: "NEWEST", limit: RAIL_SIZE, icon: "Sparkles" },
    }),
    section("d-brands", "BRAND_STRIP", {
      eyebrow: "Stocked here",
      title: "The brands we carry",
      config: { limit: 12 },
    }),
    section("d-best", "PRODUCT_RAIL", {
      eyebrow: "Popular right now",
      title: "What everyone's buying",
      href: "/search?sort=best_selling",
      config: { source: "BEST_SELLING", limit: RAIL_SIZE, icon: "Flame" },
    }),
    section("d-value", "PRODUCT_RAIL", {
      eyebrow: "Under $100",
      title: "Big upgrades, small spend",
      href: `/search?maxPrice=${VALUE_CEILING}&sort=price_asc`,
      config: {
        source: "PRICE_UNDER",
        maxPrice: VALUE_CEILING,
        limit: RAIL_SIZE,
        icon: "Wallet",
      },
    }),
    section("d-testimonials", "TESTIMONIALS", {
      eyebrow: "Owner reviews",
      title: "What people say after living with it",
      href: "/search?sort=top_rated",
      linkLabel: "Top rated",
      config: { limit: TESTIMONIAL_COUNT },
    }),
    section("d-faq", "FAQ", {
      eyebrow: "Before you buy",
      title: "Questions, answered",
    }),
    section("d-newsletter", "NEWSLETTER", {
      eyebrow: "Drops & deals",
      title: "Be first to the good stuff",
      subtitle:
        "New arrivals and subscriber-only offers, straight to your inbox. No spam, unsubscribe anytime.",
    }),
  ];
}

/**
 * Hero slides for an unconfigured store, built from live data rather than
 * hard-coded artwork: one deals slide (only when there ARE deals) plus the
 * first top-level categories that have a poster image.
 *
 * A category with no `imageUrl` is skipped rather than shown as a flat colour
 * panel — the hero is the one place where a missing photo is conspicuous, and
 * there are usually lower-priority categories to fall back to.
 */
export function defaultSlides(
  tree: CategoryTreeNode[],
  dealCount: number,
): ManagedHeroSlide[] {
  const withArt = tree.filter((c) => c.imageUrl);
  const slides: ManagedHeroSlide[] = [];

  if (dealCount > 0) {
    slides.push({
      id: "deals",
      eyebrow: "This week only",
      title: "Deals on the tech you actually want",
      subtitle: `${dealCount} product${dealCount === 1 ? "" : "s"} on sale right now — laptops, audio, gaming gear and more.`,
      ctaHref: "/deals",
      ctaLabel: "Shop the deals",
      imageUrl: withArt[0]?.imageUrl ?? null,
      sortOrder: slides.length,
    });
  }

  for (const category of withArt.slice(0, 3)) {
    slides.push({
      id: category.slug,
      eyebrow: category.name,
      title: `${category.name}, properly specced`,
      subtitle: `Explore the full ${category.name.toLowerCase()} range — filtered by price, rating and what's actually in stock.`,
      ctaHref: `/c/${category.slug}`,
      ctaLabel: `Browse ${category.name}`,
      imageUrl: category.imageUrl,
      sortOrder: slides.length,
    });
  }

  // Absolute fallback: an empty catalog still needs a hero, not a blank band.
  if (slides.length === 0) {
    slides.push({
      id: "welcome",
      eyebrow: "Welcome",
      title: "Tech worth owning",
      subtitle:
        "Laptops, phones, audio and gaming gear — curated, fairly priced, and shipped fast.",
      ctaHref: "/search",
      ctaLabel: "Start browsing",
      imageUrl: null,
      sortOrder: 0,
    });
  }

  return slides;
}

/** Flatten the tree so a section's `categoryId` can be resolved to a slug. */
export function flattenCategories(
  tree: CategoryTreeNode[],
): CategoryTreeNode[] {
  return tree.flatMap((node) => [node, ...flattenCategories(node.children)]);
}

/**
 * Fetch the products for every PRODUCT_RAIL on the page, in one parallel batch.
 *
 * Returned as a Map keyed by section id so the renderer stays synchronous — an
 * `await` inside the render loop would serialise what should be one round of
 * concurrent requests, and a homepage with six rails would then take six times
 * as long as it needs to.
 *
 * A failed feed resolves to an empty list, and an empty rail renders nothing,
 * so one broken section can never take the homepage down with it.
 */
export async function loadRailProducts(
  sections: HomepageSection[],
  tree: CategoryTreeNode[],
): Promise<Map<string, ProductListItem[]>> {
  const flat = flattenCategories(tree);
  const rails = sections.filter((s) => s.enabled && s.type === "PRODUCT_RAIL");

  const results = await Promise.all(
    rails.map(async (section) => {
      const config = section.config ?? {};
      const limit = Math.min(Math.max(config.limit ?? 12, 1), 24);
      const source: ProductSource = config.source ?? "FEATURED";

      const query: Parameters<typeof listProductsServer>[0] = {
        pageSize: limit,
      };

      switch (source) {
        case "FEATURED":
          query.featured = true;
          break;
        case "NEWEST":
          query.sort = "newest";
          break;
        case "ON_SALE":
          // Sale membership is carried by the seeded `on-sale` tag, which is
          // what the /deals page filters on too.
          query.tag = "on-sale";
          break;
        case "BEST_SELLING":
        case "TOP_RATED":
          query.sort = source.toLowerCase() as ProductSort;
          break;
        case "CATEGORY": {
          const slug = flat.find((c) => c.id === config.categoryId)?.slug;
          // A rail pointed at a deleted category returns nothing rather than
          // silently widening to the whole catalog.
          if (!slug) return [section.id, [] as ProductListItem[]] as const;
          query.categorySlug = slug;
          break;
        }
        case "TAG":
          if (!config.tag)
            return [section.id, [] as ProductListItem[]] as const;
          query.tag = config.tag;
          break;
        case "PRICE_UNDER":
          query.maxPrice = config.maxPrice ?? VALUE_CEILING;
          query.sort = "price_asc";
          break;
      }

      const feed = await listProductsServer(query);
      return [section.id, feed.items] as const;
    }),
  );

  return new Map(results);
}

/**
 * Resolve the product a SPOTLIGHT section should feature.
 *
 * Two paths, in order:
 *  1. the slug the merchant chose, fetched through the ordinary public product
 *     route — so a spotlight pointed at a drafted or deleted product resolves to
 *     `null` through the same 404 the shopper would get, with no extra check;
 *  2. no slug (or a dead one): the highest-rated FEATURED product, which is a
 *     defensible automatic choice and means the block works on a store nobody
 *     has curated yet.
 *
 * `null` renders no section at all. A spotlight is the biggest block on the
 * page; an empty-state box where one should be is far more conspicuous than
 * simply not having one.
 */
export async function loadSpotlightProduct(
  productSlug?: string,
): Promise<ProductDetail | null> {
  if (productSlug) {
    const chosen = await getProductBySlugServer(productSlug);
    if (chosen) return chosen;
  }

  const feed = await listProductsServer({
    featured: true,
    sort: "top_rated",
    pageSize: 1,
  });
  const fallback = feed.items[0];
  return fallback ? getProductBySlugServer(fallback.slug) : null;
}
