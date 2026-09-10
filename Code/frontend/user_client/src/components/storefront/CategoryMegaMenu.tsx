"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronDown } from "lucide-react";
import { categoryVisual, iconByKey } from "./category-visuals";
import type { NavNode } from "@/lib/api/storefront";
import { Glyph } from "./Glyph";

/**
 * Desktop navigation with a hover/focus mega-menu (script 14). Each top-level
 * entry reveals its children on hover OR keyboard focus (`focus-within`), so it
 * is fully keyboard operable without JS state.
 *
 * It now renders NAV NODES rather than the category tree directly (script 18).
 * That is what lets a merchant put "Gift cards" beside "Laptops", reorder the
 * bar, or keep a category out of the header without hiding it from the whole
 * storefront — and a store that has configured nothing still gets the old
 * behaviour, because the header derives nodes from its categories in that case.
 *
 * The panel is illustrated: every child carries an icon chip and the parent's
 * poster image anchors the right-hand side. Icons are structural here (they
 * help you find a row), so they sit in muted foreground and take the brand gold
 * only on hover — a wall of coloured chips in a dropdown is just confetti.
 */
export function CategoryMegaMenu({ items }: { items: NavNode[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Categories" className="hidden lg:block">
      <ul className="flex items-center gap-0.5">
        {items.map((item) => (
          <li key={item.id} className="group relative">
            <Link
              href={item.href}
              target={item.newTab ? "_blank" : undefined}
              rel={item.newTab ? "noopener noreferrer" : undefined}
              className="group/link inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <NavIcon item={item} />
              {item.label}
              {item.badge && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-primary">
                  {item.badge}
                </span>
              )}
              {item.children.length > 0 && (
                <ChevronDown
                  className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:rotate-180"
                  aria-hidden
                />
              )}
            </Link>

            {item.children.length > 0 && (
              <div className="invisible absolute left-0 top-full z-30 w-[34rem] pt-1 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <div className="overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
                  <div className="flex gap-3 p-3">
                    <ul className="grid flex-1 gap-0.5">
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={child.href}
                            target={child.newTab ? "_blank" : undefined}
                            rel={
                              child.newTab ? "noopener noreferrer" : undefined
                            }
                            className="group/child flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                          >
                            <span
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover/child:bg-primary/10 group-hover/child:text-primary"
                              aria-hidden
                            >
                              <NavIcon item={child} className="h-4 w-4" />
                            </span>
                            <span className="font-medium">{child.label}</span>
                            {child.badge && (
                              <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-primary">
                                {child.badge}
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                      {/* Only a category-backed menu has a meaningful "all of
                       * this" destination; a hand-made group like "Gift cards"
                       * with a "#" href does not. */}
                      {item.categorySlug && (
                        <li>
                          <Link
                            href={item.href}
                            className="mt-1 flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-muted"
                          >
                            All {item.label}
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                        </li>
                      )}
                    </ul>

                    {item.categoryImageUrl && (
                      <Link
                        href={item.href}
                        tabIndex={-1}
                        aria-hidden
                        className="relative hidden w-44 shrink-0 overflow-hidden rounded-xl sm:block"
                      >
                        <Image
                          src={item.categoryImageUrl}
                          alt=""
                          fill
                          sizes="176px"
                          className="object-cover"
                        />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * A nav entry's icon.
 *
 * Three tiers, so an entry always has something sensible: the icon the admin
 * picked, then the slug/name heuristic for a category-backed entry, and nothing
 * at all for a hand-made link that was given no icon — a generic box next to
 * "Gift cards" would be noise, not information.
 */
function NavIcon({
  item,
  className = "h-4 w-4 text-muted-foreground transition-colors group-hover/link:text-primary",
}: {
  item: NavNode;
  className?: string;
}) {
  const chosen =
    iconByKey(item.icon) ??
    (item.categorySlug
      ? categoryVisual(item.categorySlug, item.label).icon
      : null);
  return <Glyph icon={chosen} className={className} />;
}
