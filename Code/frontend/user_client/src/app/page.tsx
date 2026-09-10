import Link from "next/link";
import type { Metadata } from "next";
import {
  BadgePercent,
  PackageOpen,
  Sparkles,
  Star,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  listProductsServer,
  type ProductDetail,
  type ProductListItem,
} from "@/lib/api/products";
import {
  getCategoryTreeServer,
  type CategoryTreeNode,
} from "@/lib/api/categories";
import {
  getBrandsServer,
  getHomepageServer,
  getTestimonialsServer,
  type HomepageSection,
  type ManagedHeroSlide,
  type ShowcaseBrand,
  type Testimonial,
} from "@/lib/api/storefront";
import { ProductRail } from "@/components/storefront/ProductRail";
import { CategoryPosterRail } from "@/components/storefront/CategoryPoster";
import { CategoryGrid } from "@/components/storefront/CategoryGrid";
import { ProductSpotlight } from "@/components/storefront/ProductSpotlight";
import { BrandStrip } from "@/components/storefront/BrandStrip";
import { Testimonials } from "@/components/storefront/Testimonials";
import { FaqSection } from "@/components/storefront/FaqSection";
import { PAGE_GUTTER } from "@/components/storefront/page-shell";
import { cn } from "@/lib/utils";
import {
  HeroCarousel,
  type HeroSlide,
} from "@/components/storefront/HeroCarousel";
import { PromoTiles, type PromoTile } from "@/components/storefront/PromoTiles";
import { TrustBar } from "@/components/storefront/TrustBar";
import { HomeBanner } from "@/components/storefront/HomeBanner";
import { NewsletterSignup } from "@/components/storefront/NewsletterSignup";
import {
  categoryVisual,
  iconByKey,
} from "@/components/storefront/category-visuals";
import {
  GRID_SIZE,
  TESTIMONIAL_COUNT,
  defaultSections,
  defaultSlides,
  flattenCategories,
  loadRailProducts,
  loadSpotlightProduct,
} from "@/components/storefront/home-layout";

// Rendered per request so featured picks + categories stay fresh, and so
// `next build` never depends on a running backend.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Absolute so the layout's "%s | Store" template doesn't double-brand the home
  // title (script 17).
  title: { absolute: "Techistan — Tech worth owning" },
  description:
    "Laptops, phones, audio and gaming gear. Browse by category, grab this week's deals, and check out securely at Techistan.",
};

/**
 * The storefront home page.
 *
 * The page is now COMPOSED FROM DATA (script 18). Its sections — which rails,
 * in what order, sourced from where — come from the admin's homepage builder,
 * and the hero slides are editable, schedulable records rather than copy
 * synthesised from whichever categories happened to have artwork.
 *
 * A store that has never opened the builder gets `defaultSections()`, which is
 * the arrangement this file used to hard-code, expressed as the same data the
 * builder produces. Both paths therefore run through the one renderer below,
 * which is what stops the default and the configured layout from drifting
 * apart as either changes.
 */
export default async function HomePage() {
  const [tree, homepage] = await Promise.all([
    getCategoryTreeServer(),
    getHomepageServer(),
  ]);

  // The deals count is only needed to decide whether the DEFAULT hero should
  // carry a deals slide, so it is fetched on that path alone.
  const deals = homepage.configured
    ? null
    : await listProductsServer({ tag: "on-sale", pageSize: 1 });

  const sections = homepage.configured ? homepage.sections : defaultSections();
  const slides = homepage.configured
    ? homepage.slides
    : defaultSlides(tree, deals?.total ?? 0);

  const enabled = sections.filter((s) => s.enabled);

  // Everything the enabled sections need, in ONE round of concurrent requests.
  // The showcase feeds are fetched only when their block is actually on the
  // page: a store that has turned the reviews block off should not be paying
  // for a reviews query on every render.
  const spotlight = enabled.find((s) => s.type === "SPOTLIGHT");
  const testimonialSection = enabled.find((s) => s.type === "TESTIMONIALS");
  const brandSection = enabled.find((s) => s.type === "BRAND_STRIP");

  const [railProducts, spotlightProduct, testimonials, brands] =
    await Promise.all([
      loadRailProducts(enabled, tree),
      spotlight
        ? loadSpotlightProduct(spotlight.config?.productSlug)
        : Promise.resolve(null),
      testimonialSection
        ? getTestimonialsServer(
            testimonialSection.config?.limit ?? TESTIMONIAL_COUNT,
          )
        : Promise.resolve([]),
      brandSection
        ? getBrandsServer(brandSection.config?.limit ?? 12)
        : Promise.resolve([]),
    ]);

  const catalogIsEmpty =
    tree.length === 0 &&
    [...railProducts.values()].every((items) => items.length === 0);

  return (
    <div className="pb-4">
      {/* The hero has no padding of its own because it is edge-to-edge.
       * If the merchant has disabled or removed the HERO section, nothing is
       * rendered here at all. */}
      {enabled.some((s) => s.type === "HERO") && (
        <HeroCarousel slides={slides.map(toHeroSlide)} />
      )}

      {/* Full-bleed: no `max-w-*` cap, so every block uses the whole viewport
       * the way the hero does. Only the page gutter is held back, and it grows
       * with the screen so content never runs into the edge of the glass.
       * The gutter is shared with the header and footer so the three line up
       * exactly — a wide page under a narrow header reads as a mistake. */}
      <div className={cn("space-y-14 py-12 sm:space-y-16", PAGE_GUTTER)}>
        {enabled
          .filter((section) => section.type !== "HERO")
          .map((section) => (
            <Section
              key={section.id}
              section={section}
              tree={tree}
              products={railProducts.get(section.id) ?? []}
              spotlightProduct={spotlightProduct}
              testimonials={testimonials}
              brands={brands}
            />
          ))}

        {catalogIsEmpty && (
          <div className="border-border bg-card flex flex-col items-center gap-3 rounded-3xl border border-dashed py-20 text-center">
            <PackageOpen
              className="text-muted-foreground h-9 w-9"
              aria-hidden
            />
            <p className="text-muted-foreground text-sm">
              No products to show yet. Check back soon.
            </p>
            <Link
              href="/search"
              className="text-primary text-sm font-semibold hover:underline"
            >
              Browse the catalog
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Render one section.
 *
 * An unrecognised `type` renders NOTHING rather than throwing. That is what
 * lets the admin and the storefront ship independently: a section type added
 * to the backend before this file knows about it degrades to a gap, not a
 * 500.
 */
function Section({
  section,
  tree,
  products,
  spotlightProduct,
  testimonials,
  brands,
}: {
  section: HomepageSection;
  tree: CategoryTreeNode[];
  products: ProductListItem[];
  /** Resolved once by the page — there is only ever one spotlight worth showing. */
  spotlightProduct: ProductDetail | null;
  testimonials: Testimonial[];
  brands: ShowcaseBrand[];
}) {
  const config = section.config ?? {};

  switch (section.type) {
    case "TRUST_BAR":
      return <TrustBar />;

    case "FAQ":
      return (
        <FaqSection
          id={`home-${section.id}`}
          eyebrow={section.eyebrow ?? undefined}
          title={section.title ?? undefined}
        />
      );

    case "CATEGORY_GRID": {
      const pool = config.featuredOnly ? tree.filter((c) => c.featured) : tree;
      return (
        <CategoryGrid
          id={`home-${section.id}`}
          eyebrow={section.eyebrow ?? undefined}
          title={section.title ?? "Shop by category"}
          subtitle={section.subtitle ?? undefined}
          categories={pool.slice(0, config.limit ?? GRID_SIZE)}
          href={section.href ?? undefined}
          linkLabel={section.linkLabel ?? undefined}
        />
      );
    }

    case "SPOTLIGHT":
      // No resolvable product means no block. See `loadSpotlightProduct`.
      if (!spotlightProduct) return null;
      return (
        <ProductSpotlight
          id={`home-${section.id}`}
          eyebrow={section.eyebrow ?? undefined}
          title={section.title ?? undefined}
          subtitle={section.subtitle ?? undefined}
          product={spotlightProduct}
          secondaryLabel={
            config.secondaryLabel ?? section.linkLabel ?? undefined
          }
          secondaryHref={config.secondaryHref ?? section.href ?? undefined}
        />
      );

    case "BRAND_STRIP":
      return (
        <BrandStrip
          id={`home-${section.id}`}
          eyebrow={section.eyebrow ?? undefined}
          title={section.title ?? undefined}
          brands={brands}
        />
      );

    case "TESTIMONIALS":
      return (
        <Testimonials
          id={`home-${section.id}`}
          eyebrow={section.eyebrow ?? undefined}
          title={section.title ?? "What owners say"}
          href={section.href ?? undefined}
          linkLabel={section.linkLabel ?? undefined}
          testimonials={testimonials}
        />
      );

    case "CATEGORY_RAIL": {
      const pool = config.featuredOnly ? tree.filter((c) => c.featured) : tree;
      return (
        <CategoryPosterRail
          id={`home-${section.id}`}
          eyebrow={section.eyebrow ?? undefined}
          title={section.title ?? "Shop by category"}
          categories={pool.slice(0, config.limit ?? 12)}
          href={section.href ?? undefined}
        />
      );
    }

    case "PRODUCT_RAIL":
      return (
        <ProductRail
          id={`home-${section.id}`}
          eyebrow={section.eyebrow ?? undefined}
          title={section.title ?? "Products"}
          icon={sectionIcon(config.icon, section.title)}
          products={products}
          href={section.href ?? undefined}
          linkLabel={section.linkLabel ?? undefined}
          // A category rail shows one category, so repeating its name on every
          // card is noise.
          showCategory={config.source !== "CATEGORY"}
        />
      );

    case "PROMO_TILES":
      return <PromoTiles tiles={buildPromoTiles(tree, config.limit ?? 3)} />;

    case "BANNER":
      return (
        <HomeBanner
          id={`home-${section.id}`}
          eyebrow={section.eyebrow}
          title={section.title ?? ""}
          subtitle={section.subtitle}
          href={section.href}
          ctaLabel={config.ctaLabel ?? section.linkLabel}
          imageUrl={config.imageUrl}
        />
      );

    case "NEWSLETTER":
      return (
        <section className="bg-primary text-primary-foreground overflow-hidden rounded-2xl px-6 py-14 text-center">
          <div className="flex flex-col items-center gap-4">
            {section.eyebrow && (
              <span className="eyebrow inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 ring-1 ring-white/25">
                <Zap className="h-3.5 w-3.5" aria-hidden />
                {section.eyebrow}
              </span>
            )}
            <h2 className="font-heading text-3xl font-bold sm:text-4xl">
              {section.title ?? "Be first to the good stuff"}
            </h2>
            {section.subtitle && (
              <p className="max-w-md text-sm opacity-90">{section.subtitle}</p>
            )}
            <div className="flex justify-center pt-1">
              {/* The panel is solid gold, so the form needs its brand dressing:
               * a dark field with white text and a near-black button. Left on
               * the default it would inherit the panel's near-black foreground
               * and type invisibly. */}
              <NewsletterSignup tone="brand" />
            </div>
          </div>
        </section>
      );

    default:
      return null;
  }
}

/**
 * A rail heading's icon: the admin's choice, else a guess from the heading
 * words, else none. `ProductRail` renders no chip at all for `undefined`, which
 * is the right outcome for a section whose title suggests nothing.
 */
function sectionIcon(
  iconKey: string | undefined,
  title: string | null,
): LucideIcon | undefined {
  const chosen = iconByKey(iconKey);
  if (chosen) return chosen;
  const words = (title ?? "").toLowerCase();
  if (words.includes("deal") || words.includes("sale")) return BadgePercent;
  if (words.includes("new")) return Sparkles;
  if (words.includes("featured") || words.includes("top")) return Star;
  if (words.includes("value") || words.includes("under")) return Wallet;
  return undefined;
}

/** Adapt a managed slide to the carousel's shape. */
function toHeroSlide(slide: ManagedHeroSlide): HeroSlide {
  return {
    key: slide.id,
    eyebrow: slide.eyebrow ?? "",
    title: slide.title,
    subtitle: slide.subtitle ?? "",
    href: slide.ctaHref ?? "/search",
    ctaLabel: slide.ctaLabel ?? "Shop now",
    imageUrl: slide.imageUrl,
    // The badge icon is derived from the destination: a slide pointing at
    // /c/<slug> gets that category's icon, anything else gets the generic
    // "featured" star. A per-slide icon field would be a fourth thing to fill
    // in for a badge nobody edits.
    categorySlug: slide.ctaHref?.startsWith("/c/")
      ? slide.ctaHref.slice(3)
      : undefined,
    iconKey: slide.ctaHref?.startsWith("/deals") ? "deals" : undefined,
  };
}

/**
 * The editorial promo posters, built from categories that have artwork.
 *
 * Still derived rather than authored: a merchant who wants specific promo
 * artwork now adds a BANNER section, which is the block designed for that. This
 * keeps the tiles as what they always were — an attractive way to fill space
 * with the catalog you already have.
 */
function buildPromoTiles(tree: CategoryTreeNode[], limit: number): PromoTile[] {
  const withArt = flattenCategories(tree).filter((c) => c.imageUrl);
  if (withArt.length === 0) return [];

  const tiles: PromoTile[] = [];
  const [lead, ...rest] = withArt;

  tiles.push({
    key: lead.slug,
    eyebrow: "Collection",
    title: lead.name,
    body:
      lead.description ??
      `Everything in ${lead.name.toLowerCase()}, from entry level to flagship.`,
    href: `/c/${lead.slug}`,
    cta: "Explore",
    imageUrl: lead.imageUrl,
    icon: categoryVisual(lead.slug, lead.name, lead.iconKey).icon,
    wide: true,
  });

  for (const category of rest.slice(0, Math.max(0, limit - 1))) {
    tiles.push({
      key: category.slug,
      eyebrow: "Collection",
      title: category.name,
      body:
        category.description ??
        `Everything in ${category.name.toLowerCase()}, from entry level to flagship.`,
      href: `/c/${category.slug}`,
      cta: "Explore",
      imageUrl: category.imageUrl,
      icon: categoryVisual(category.slug, category.name, category.iconKey).icon,
    });
  }

  return tiles;
}
