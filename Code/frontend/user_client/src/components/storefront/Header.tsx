import Link from "next/link";
import { BadgePercent } from "lucide-react";
import { getSettingsServer } from "@/lib/api/settings";
import { getCategoryTreeServer } from "@/lib/api/categories";
import { getNavigationServer } from "@/lib/api/storefront";
import { SearchAutocomplete } from "@/components/search/SearchAutocomplete";
import { Logo } from "@/components/brand/Logo";
import { CartButton } from "./CartButton";
import { NotificationBell } from "./NotificationBell";
import { CategoryMegaMenu } from "./CategoryMegaMenu";
import { AccountMenu } from "./AccountMenu";
import { MobileNav } from "./MobileNav";
import { AnnouncementBar } from "./AnnouncementBar";
import { navFromCategories } from "./nav-model";
import { PAGE_GUTTER } from "./page-shell";
import { cn } from "@/lib/utils";

/**
 * Storefront header (script 14). Server Component: fetches public settings, the
 * category tree and the configured navigation once per request (all
 * error-tolerant) and hands them to the client mega-menu / mobile nav.
 *
 * NAVIGATION SOURCE (script 18). The bar renders whatever the merchant
 * configured in the admin. When they have configured nothing, it falls back to
 * deriving entries from the category tree — exactly what this component used to
 * hard-code — so an existing store is unchanged until someone opts in. The
 * `configured` flag is what separates "never set up" from "deliberately
 * emptied": only the former gets the fallback.
 *
 * LAYOUT — two rows, which is the whole point of the previous revision.
 *
 * The single-row header this replaced put the logo, the full category nav, the
 * search field and five action buttons on one line. Search was the only
 * flexible item, so it absorbed every pixel the others didn't want and
 * collapsed to a stub the moment a store had more than three categories.
 *
 * Splitting them fixes it structurally rather than by tuning widths:
 *   row 1 — logo (fixed) · search (flex-1, up to 42rem) · actions (fixed)
 *   row 2 — navigation, which now has the full width to itself
 *
 * Search is the single most-used control on a storefront, so it gets the
 * middle of the primary row and cannot be squeezed by however many categories
 * the merchant creates.
 */
export async function Header() {
  const [settings, tree, navigation] = await Promise.all([
    getSettingsServer(),
    getCategoryTreeServer(),
    getNavigationServer(),
  ]);

  const items = navigation.configured
    ? navigation.header
    : navFromCategories(tree);

  return (
    <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <AnnouncementBar announcement={settings.announcement} />

      {/* Row 1 — brand, search, actions. */}
      <div className={cn("flex h-16 items-center gap-3 sm:gap-4", PAGE_GUTTER)}>
        <MobileNav items={items} />

        <Logo name={settings.name} logoUrl={settings.logoUrl} />

        {/* The search field owns the centre of the header and is capped rather
         * than sized, so it stays a comfortable target on 4K displays too. */}
        <div className="mx-auto hidden w-full max-w-2xl flex-1 md:block">
          <SearchAutocomplete />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
          <NotificationBell />
          <AccountMenu />
          <CartButton />
        </div>
      </div>

      {/* Row 2 — navigation, with the full width to itself. */}
      {items.length > 0 && (
        <div className="border-border hidden border-t lg:block">
          <div className={cn("flex h-11 items-center gap-2", PAGE_GUTTER)}>
            <CategoryMegaMenu items={items} />

            {/* Deals is pinned here only while the menu is UNCONFIGURED. Once a
             * merchant owns the header, adding or removing it is their call,
             * and a link they cannot delete would be a bug. */}
            {!navigation.configured && (
              <Link
                href="/deals"
                className="text-primary hover:bg-primary/10 ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors"
              >
                <BadgePercent className="h-4 w-4" aria-hidden />
                Deals
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Dedicated mobile search row — below the logo/actions bar, where the
       * field can be full-width instead of competing with the action icons. */}
      <div className="border-border border-t px-4 py-2 md:hidden">
        <SearchAutocomplete />
      </div>
    </header>
  );
}
