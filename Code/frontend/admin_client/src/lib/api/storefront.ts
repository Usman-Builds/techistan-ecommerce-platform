/**
 * Storefront content API (script 18): the homepage layout and the header/footer
 * navigation, as editable data rather than hard-coded JSX.
 */
import { apiClient } from "./client";

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

/** Where a product rail sources its products. */
export type ProductSource =
  | "FEATURED"
  | "NEWEST"
  | "ON_SALE"
  | "BEST_SELLING"
  | "TOP_RATED"
  | "CATEGORY"
  | "TAG"
  | "PRICE_UNDER";

/**
 * Per-type extras. Every key is optional and every renderer falls back, so a
 * section configured for one type and switched to another degrades rather than
 * breaking.
 */
export interface HomepageSectionConfig {
  source?: ProductSource;
  categoryId?: string;
  tag?: string;
  /** Integer cents, for source = PRICE_UNDER. */
  maxPrice?: number;
  limit?: number;
  /** Lucide icon name for the section heading. */
  icon?: string;
  imageId?: string;
  imageUrl?: string;
  ctaLabel?: string;
  /** CATEGORY_RAIL / CATEGORY_GRID: show only categories flagged as featured. */
  featuredOnly?: boolean;
  /** SPOTLIGHT: the product to feature. Blank = the best-rated featured one. */
  productSlug?: string;
  /** SPOTLIGHT: the optional second button beside "View details". */
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
  createdAt: string;
  updatedAt: string;
}

export interface HeroSlide {
  id: string;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imageId: string | null;
  imageUrl: string | null;
  sortOrder: number;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminHomepage {
  sections: HomepageSection[];
  slides: HeroSlide[];
}

export type HomepageSectionInput = Partial<
  Omit<HomepageSection, "id" | "createdAt" | "updatedAt">
> & { type?: HomeSectionType };

export type HeroSlideInput = Partial<
  Omit<HeroSlide, "id" | "createdAt" | "updatedAt">
> & { title?: string };

export interface ReorderItem {
  id: string;
  sortOrder: number;
}

export function getAdminHomepage(): Promise<AdminHomepage> {
  return apiClient.get<AdminHomepage>("/admin/homepage");
}

/** `replace` clears the current layout first — the "reset to default" action. */
export function seedHomepage(
  replace = false,
): Promise<{ seeded: boolean; sections?: number; slides?: number }> {
  return apiClient.post(`/admin/homepage/seed?replace=${replace}`);
}

export function createHomepageSection(
  input: HomepageSectionInput & { type: HomeSectionType },
): Promise<HomepageSection> {
  return apiClient.post<HomepageSection>("/admin/homepage/sections", input);
}

export function updateHomepageSection(
  id: string,
  input: HomepageSectionInput,
): Promise<HomepageSection> {
  return apiClient.patch<HomepageSection>(
    `/admin/homepage/sections/${id}`,
    input,
  );
}

export function deleteHomepageSection(
  id: string,
): Promise<{ id: string; deleted: boolean }> {
  return apiClient.delete(`/admin/homepage/sections/${id}`);
}

export function reorderHomepageSections(
  items: ReorderItem[],
): Promise<{ updated: number }> {
  return apiClient.post("/admin/homepage/sections/reorder", { items });
}

export function createHeroSlide(
  input: HeroSlideInput & { title: string },
): Promise<HeroSlide> {
  return apiClient.post<HeroSlide>("/admin/homepage/slides", input);
}

export function updateHeroSlide(
  id: string,
  input: HeroSlideInput,
): Promise<HeroSlide> {
  return apiClient.patch<HeroSlide>(`/admin/homepage/slides/${id}`, input);
}

export function deleteHeroSlide(
  id: string,
): Promise<{ id: string; deleted: boolean }> {
  return apiClient.delete(`/admin/homepage/slides/${id}`);
}

export function reorderHeroSlides(
  items: ReorderItem[],
): Promise<{ updated: number }> {
  return apiClient.post("/admin/homepage/slides/reorder", { items });
}

// ── Navigation ───────────────────────────────────────────────────────────────

export type NavLocation = "HEADER" | "FOOTER";

export interface NavItem {
  id: string;
  location: NavLocation;
  parentId: string | null;
  label: string;
  href: string | null;
  categoryId: string | null;
  icon: string | null;
  badge: string | null;
  newTab: boolean;
  sortOrder: number;
  enabled: boolean;
  category: { slug: string; name: string; isActive: boolean } | null;
}

export type NavItemInput = Partial<Omit<NavItem, "id" | "category">> & {
  location?: NavLocation;
  label?: string;
};

export interface NavReorderItem {
  id: string;
  parentId?: string | null;
  sortOrder: number;
}

export function listNavItems(location?: NavLocation): Promise<NavItem[]> {
  const qs = location ? `?location=${location}` : "";
  return apiClient.get<NavItem[]>(`/admin/navigation${qs}`);
}

/** Build a starting menu from the store's own categories. */
export function seedNavigation(
  location?: NavLocation,
  replace = false,
): Promise<{ seeded: boolean; created?: number }> {
  const params = new URLSearchParams();
  if (location) params.set("location", location);
  params.set("replace", String(replace));
  return apiClient.post(`/admin/navigation/seed?${params.toString()}`);
}

export function createNavItem(
  input: NavItemInput & { location: NavLocation; label: string },
): Promise<NavItem> {
  return apiClient.post<NavItem>("/admin/navigation", input);
}

export function updateNavItem(
  id: string,
  input: NavItemInput,
): Promise<NavItem> {
  return apiClient.patch<NavItem>(`/admin/navigation/${id}`, input);
}

export function deleteNavItem(
  id: string,
): Promise<{ id: string; deleted: boolean }> {
  return apiClient.delete(`/admin/navigation/${id}`);
}

export function reorderNavItems(
  items: NavReorderItem[],
): Promise<{ updated: number }> {
  return apiClient.post("/admin/navigation/reorder", { items });
}
