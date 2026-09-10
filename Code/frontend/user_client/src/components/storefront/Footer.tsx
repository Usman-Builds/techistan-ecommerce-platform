import Link from "next/link";
import { CreditCard, ShieldCheck } from "lucide-react";
import { getSettingsServer } from "@/lib/api/settings";
import { getCategoryTreeServer } from "@/lib/api/categories";
import { getNavigationServer, type NavNode } from "@/lib/api/storefront";
import { NewsletterSignup } from "./NewsletterSignup";
import { LogoMark } from "@/components/brand/Logo";
import { categoryVisual, iconByKey } from "./category-visuals";
import { footerFromCategories } from "./nav-model";
import { Glyph } from "./Glyph";
import { PAGE_GUTTER } from "./page-shell";
import { cn } from "@/lib/utils";

const DEFAULT_TAGLINE =
  "Laptops, phones, audio and gaming gear — curated, fairly priced, and shipped fast.";

/**
 * Storefront footer (script 14). Server Component: link columns, newsletter
 * signup, social links from settings, and payment badges.
 *
 * The columns are the merchant's configured FOOTER navigation (script 18) —
 * previously they were hard-coded JSX that derived "Shop" from the category
 * tree and listed four fixed account links, so a store could not add a
 * "Company" or "Legal" column at all. A store that has configured nothing falls
 * back to exactly those two columns, so nothing changes until someone opts in.
 *
 * The tagline and copyright line are settings rather than nav entries, because
 * neither is a link.
 */
export async function Footer() {
  const [settings, tree, navigation] = await Promise.all([
    getSettingsServer(),
    getCategoryTreeServer(),
    getNavigationServer(),
  ]);

  const columns = navigation.configured
    ? navigation.footer
    : footerFromCategories(tree);

  const socials = settings.socials ?? {};
  const socialEntries = Object.entries(socials).filter(([, url]) =>
    Boolean(url),
  );

  return (
    <footer className="bg-card mt-16">
      <div className="border-border border-t" aria-hidden />

      <div className={cn("grid gap-10 py-12 md:grid-cols-4", PAGE_GUTTER)}>
        <div className="space-y-3">
          <p className="font-heading flex items-center gap-2 text-lg font-bold">
            <LogoMark />
            {settings.name}
          </p>
          <p className="text-muted-foreground text-sm">
            {settings.footerTagline ?? DEFAULT_TAGLINE}
          </p>
          {settings.contactEmail && (
            <a
              href={`mailto:${settings.contactEmail}`}
              className="text-muted-foreground hover:text-foreground block text-sm"
            >
              {settings.contactEmail}
            </a>
          )}
          {socialEntries.length > 0 && (
            <ul className="flex flex-wrap gap-3 pt-1 text-sm">
              {socialEntries.map(([name, url]) => (
                <li key={name}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground capitalize hover:underline"
                  >
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Two columns of links, then the newsletter — capped so a merchant who
         * configures six columns doesn't overflow the four-column grid. */}
        {columns.slice(0, 2).map((column) => (
          <FooterColumn key={column.id} column={column} />
        ))}

        <div className="space-y-4">
          <NewsletterSignup />
        </div>
      </div>

      {/* Any columns past the first two get their own full-width row rather
       * than being dropped — a configured link that silently never renders is
       * worse than a second row. */}
      {columns.length > 2 && (
        <div className="border-border border-t">
          <div
            className={cn(
              "grid gap-10 py-8 sm:grid-cols-2 md:grid-cols-4",
              PAGE_GUTTER,
            )}
          >
            {columns.slice(2).map((column) => (
              <FooterColumn key={column.id} column={column} />
            ))}
          </div>
        </div>
      )}

      <div className="border-border border-t">
        <div
          className={cn(
            "text-muted-foreground flex flex-col items-center justify-between gap-3 py-5 text-sm sm:flex-row",
            PAGE_GUTTER,
          )}
        >
          <p>
            {settings.footerNote ?? `© ${settings.name}. All rights reserved.`}
          </p>
          <p className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Secure checkout
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CreditCard className="h-4 w-4" aria-hidden />
              Visa · Mastercard · Amex
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}

/**
 * One footer column.
 *
 * The heading is only a link when the merchant gave it a real destination —
 * an unconfigured store's "Shop" heading is a grouping label with a "#" href,
 * and rendering that as a link would be a dead end.
 */
function FooterColumn({ column }: { column: NavNode }) {
  const headingIsLink = column.href !== "#" && column.href.length > 0;

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">
        {headingIsLink ? (
          <Link href={column.href} className="hover:underline">
            {column.label}
          </Link>
        ) : (
          column.label
        )}
      </h2>
      <ul className="text-muted-foreground space-y-1.5 text-sm">
        {column.children.map((link) => (
          <li key={link.id}>
            <Link
              href={link.href}
              target={link.newTab ? "_blank" : undefined}
              rel={link.newTab ? "noopener noreferrer" : undefined}
              className="hover:text-foreground inline-flex items-center gap-2"
            >
              <FooterIcon item={link} />
              {link.label}
              {link.badge && (
                <span className="bg-primary/15 text-primary rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold uppercase">
                  {link.badge}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Admin-chosen icon, else the category heuristic, else nothing. */
function FooterIcon({ item }: { item: NavNode }) {
  const chosen =
    iconByKey(item.icon) ??
    (item.categorySlug
      ? categoryVisual(item.categorySlug, item.label).icon
      : null);
  return <Glyph icon={chosen} className="h-4 w-4" />;
}
