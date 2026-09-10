/**
 * Storefront content (script 18): the homepage layout and the header/footer
 * navigation, both managed from the admin.
 *
 * Every read here reports a `configured` flag, and the components fall back to
 * their built-in layout when it is false. That is what lets a store that has
 * never opened the admin builder look exactly as it did before, while a store
 * that HAS emptied a menu on purpose gets an empty menu rather than a silently
 * resurrected default.
 */
import { serverGet } from "@/lib/server/api";

// ── Homepage ─────────────────────────────────────────────────────────────────

export type HomeSectionType =
  | "HERO"
  | "TRUST_BAR"
  | "CATEGORY_RAIL"
  | "CATEGORY_GRID"
  | "PRODUCT_RAIL"
  | "SPOTLIGHT"
  | "PROMO_TILES"
  | "BANNER"
  | "BRAND_STRIP"
  | "TESTIMONIALS"
  | "FAQ"
  | "NEWSLETTER";

export type ProductSource =
  | "FEATURED"
  | "NEWEST"
  | "ON_SALE"
  | "BEST_SELLING"
  | "TOP_RATED"
  | "CATEGORY"
  | "TAG"
  | "PRICE_UNDER";

export interface HomepageSectionConfig {
  source?: ProductSource;
  categoryId?: string;
  tag?: string;
  maxPrice?: number;
  limit?: number;
  icon?: string;
  imageId?: string;
  imageUrl?: string;
  ctaLabel?: string;
  featuredOnly?: boolean;
  /** SPOTLIGHT: the product to feature. Blank = pick the best-rated one. */
  productSlug?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export interface HomepageSection {
  id: string;
  type: HomeSectionType;
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
  href: string | null;
  linkLabel: string | null;
  config: HomepageSectionConfig | null;
  sortOrder: number;
  enabled: boolean;
}

export interface ManagedHeroSlide {
  id: string;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

export interface HomepageContent {
  /** False when the store has never configured a layout. */
  configured: boolean;
  sections: HomepageSection[];
  slides: ManagedHeroSlide[];
}

const EMPTY_HOMEPAGE: HomepageContent = {
  configured: false,
  sections: [],
  slides: [],
};

export async function getHomepageServer(): Promise<HomepageContent> {
  return (
    (await serverGet<HomepageContent>("/storefront/homepage")) ?? EMPTY_HOMEPAGE
  );
}

// ── Showcase (testimonials + brands) ─────────────────────────────────────────

/**
 * The two homepage blocks whose content comes from across the catalog rather
 * than from their own section row. Both are fetched only when the block is
 * enabled, and both resolve to `[]` on any failure — an empty list renders no
 * section, which is the right outcome for a store with no reviews yet.
 */
export interface Testimonial {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  author: string;
  createdAt: string;
  /** Written against a real order. */
  verified: boolean;
  product: { title: string; slug: string; imageUrl: string | null };
}

export interface ShowcaseBrand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  productCount: number;
}

export async function getTestimonialsServer(limit = 6): Promise<Testimonial[]> {
  return (
    (await serverGet<Testimonial[]>(
      `/storefront/testimonials?limit=${limit}`,
    )) ?? []
  );
}

export async function getBrandsServer(limit = 12): Promise<ShowcaseBrand[]> {
  return (
    (await serverGet<ShowcaseBrand[]>(`/storefront/brands?limit=${limit}`)) ??
    []
  );
}

// ── Navigation ───────────────────────────────────────────────────────────────

export interface NavNode {
  id: string;
  label: string;
  /** Already resolved — a category entry arrives as its current /c/<slug>. */
  href: string;
  icon: string | null;
  badge: string | null;
  newTab: boolean;
  categorySlug: string | null;
  /** The bound category's poster art, so the mega-menu can illustrate itself. */
  categoryImageUrl: string | null;
  children: NavNode[];
}

export interface NavigationContent {
  /** False when the store has never configured a menu. */
  configured: boolean;
  header: NavNode[];
  footer: NavNode[];
}

const EMPTY_NAVIGATION: NavigationContent = {
  configured: false,
  header: [],
  footer: [],
};

export async function getNavigationServer(): Promise<NavigationContent> {
  return (
    (await serverGet<NavigationContent>("/storefront/navigation")) ??
    EMPTY_NAVIGATION
  );
}
