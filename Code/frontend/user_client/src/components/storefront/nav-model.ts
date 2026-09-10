import type { CategoryTreeNode } from "@/lib/api/categories";
import type { NavNode } from "@/lib/api/storefront";

/**
 * Derive header navigation from the category tree.
 *
 * This is the FALLBACK path: a store that has never configured a menu keeps the
 * behaviour it always had — top-level categories across the bar, their children
 * in the dropdown — so nothing changes until a merchant opts in. Once they do,
 * the configured menu wins entirely and this is not consulted.
 *
 * Only `showInNav` categories appear, which is what makes that flag mean
 * something in an unconfigured store too.
 */
export function navFromCategories(tree: CategoryTreeNode[]): NavNode[] {
  return tree
    .filter((c) => c.showInNav)
    .map((category) => ({
      id: category.id,
      label: category.name,
      href: `/c/${category.slug}`,
      icon: category.iconKey,
      badge: null,
      newTab: false,
      categorySlug: category.slug,
      categoryImageUrl: category.imageUrl,
      children: category.children
        .filter((child) => child.showInNav)
        .map((child) => ({
          id: child.id,
          label: child.name,
          href: `/c/${child.slug}`,
          icon: child.iconKey,
          badge: null,
          newTab: false,
          categorySlug: child.slug,
          categoryImageUrl: child.imageUrl,
          children: [],
        })),
    }));
}

/**
 * Derive footer columns from the category tree.
 *
 * The unconfigured footer is what the JSX used to hard-code: a "Shop" column of
 * categories and a "Help" column of account links. Capped at six categories
 * because a footer column is a summary, not a sitemap.
 */
export function footerFromCategories(tree: CategoryTreeNode[]): NavNode[] {
  const shopChildren: NavNode[] = tree
    .filter((c) => c.showInNav)
    .slice(0, 6)
    .map((category) => ({
      id: category.id,
      label: category.name,
      href: `/c/${category.slug}`,
      icon: category.iconKey,
      badge: null,
      newTab: false,
      categorySlug: category.slug,
      categoryImageUrl: category.imageUrl,
      children: [],
    }));

  return [
    {
      id: "shop",
      label: "Shop",
      href: "#",
      icon: null,
      badge: null,
      newTab: false,
      categorySlug: null,
      categoryImageUrl: null,
      children: [
        ...shopChildren,
        leaf("deals", "Deals", "/deals", "BadgePercent"),
        leaf("all", "All products", "/search"),
      ],
    },
    {
      id: "help",
      label: "Help",
      href: "#",
      icon: null,
      badge: null,
      newTab: false,
      categorySlug: null,
      categoryImageUrl: null,
      children: [
        leaf("orders", "Track your order", "/account/orders"),
        leaf("account", "My account", "/account"),
        leaf("wishlist", "Wishlist", "/wishlist"),
        leaf("cart", "Cart", "/cart"),
      ],
    },
  ];
}

function leaf(
  id: string,
  label: string,
  href: string,
  icon: string | null = null,
): NavNode {
  return {
    id,
    label,
    href,
    icon,
    badge: null,
    newTab: false,
    categorySlug: null,
    categoryImageUrl: null,
    children: [],
  };
}
