"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { categoryVisual, iconByKey } from "./category-visuals";
import type { NavNode } from "@/lib/api/storefront";
import { Glyph } from "./Glyph";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Mobile slide-over navigation (script 14). Hamburger opens a focus-dismissable
 * drawer with the navigation tree (top level + children) and account links.
 * Closes on Escape, backdrop click, or navigation. Motion is ≤300ms and
 * reduced-motion aware.
 *
 * Takes the SAME nav nodes as the desktop mega-menu (script 18), so the two can
 * no longer disagree about what is in the menu — which they would the moment a
 * merchant added a non-category link to one of them.
 *
 * THE OVERLAY IS PORTALLED TO `document.body`, and that is load-bearing rather
 * than tidiness. This component renders inside `<header>`, which carries
 * `backdrop-blur` — and an ancestor with a `backdrop-filter` other than `none`
 * becomes the containing block for its `position: fixed` descendants. Rendered
 * in place, the drawer's `inset-0` therefore resolved to the HEADER's box
 * instead of the viewport, so "open" produced a ~64px-tall sliver pinned under
 * the top bar. Its `z-50` was also trapped inside the header's `z-40` stacking
 * context, so it could never rise above anything outside it.
 *
 * Portalling moves the overlay out to the document root, where `fixed` means
 * what it says. Do not "simplify" this back into the tree; removing the
 * header's blur would work too, but that is chrome the design wants.
 */
export function MobileNav({ items }: { items: NavNode[] }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const { isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="border-border bg-card inline-flex h-10 w-10 items-center justify-center rounded-md border lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {/* `typeof document` rather than a mounted flag: this render is skipped
       * entirely on the server (where there is no body to portal into) and the
       * portal is empty on the client until something opens it, so hydration
       * sees the same nothing on both sides. */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="fixed inset-0 z-50 lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.2 }}
              >
                <div
                  className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => setOpen(false)}
                  aria-hidden
                />
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Menu"
                  className="border-border bg-card absolute top-0 left-0 flex h-full w-80 max-w-[85vw] flex-col overflow-y-auto border-r"
                  initial={{ x: reduced ? 0 : "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: reduced ? 0 : "-100%" }}
                  transition={{ duration: reduced ? 0 : 0.28, ease: "easeOut" }}
                >
                  <div className="border-border flex items-center justify-between border-b p-4">
                    <span className="font-heading text-lg font-bold">Menu</span>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Close menu"
                      className="hover:bg-muted inline-flex h-9 w-9 items-center justify-center rounded-md"
                    >
                      <X className="h-5 w-5" aria-hidden />
                    </button>
                  </div>

                  <nav aria-label="Categories" className="flex-1 p-4">
                    <ul className="space-y-1">
                      {items.map((item) => (
                        <li key={item.id}>
                          <Link
                            href={item.href}
                            target={item.newTab ? "_blank" : undefined}
                            rel={
                              item.newTab ? "noopener noreferrer" : undefined
                            }
                            onClick={() => setOpen(false)}
                            className="hover:bg-muted flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-semibold"
                          >
                            <span
                              className="bg-muted text-muted-foreground grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                              aria-hidden
                            >
                              <NavIcon item={item} />
                            </span>
                            {item.label}
                            {item.badge && (
                              <span className="bg-primary/15 text-primary ml-auto rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold uppercase">
                                {item.badge}
                              </span>
                            )}
                          </Link>
                          {item.children.length > 0 && (
                            <ul className="border-border ml-6 border-l pl-2">
                              {item.children.map((child) => (
                                <li key={child.id}>
                                  <Link
                                    href={child.href}
                                    target={child.newTab ? "_blank" : undefined}
                                    rel={
                                      child.newTab
                                        ? "noopener noreferrer"
                                        : undefined
                                    }
                                    onClick={() => setOpen(false)}
                                    className="text-muted-foreground hover:bg-muted hover:text-foreground block rounded-md px-3 py-1.5 text-sm"
                                  >
                                    {child.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </nav>

                  <div className="border-border border-t p-4">
                    <ul className="space-y-1 text-sm">
                      <li>
                        <Link
                          href="/account"
                          onClick={() => setOpen(false)}
                          className="hover:bg-muted block rounded-md px-3 py-2"
                        >
                          My account
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/account/orders"
                          onClick={() => setOpen(false)}
                          className="hover:bg-muted block rounded-md px-3 py-2"
                        >
                          Orders
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/wishlist"
                          onClick={() => setOpen(false)}
                          className="hover:bg-muted block rounded-md px-3 py-2"
                        >
                          Wishlist
                        </Link>
                      </li>
                      <li>
                        {isAuthenticated ? (
                          <button
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              void logout();
                            }}
                            className="hover:bg-muted block w-full rounded-md px-3 py-2 text-left"
                          >
                            Sign out
                          </button>
                        ) : (
                          <Link
                            href="/login"
                            onClick={() => setOpen(false)}
                            className="text-primary hover:bg-muted block rounded-md px-3 py-2 font-medium"
                          >
                            Sign in
                          </Link>
                        )}
                      </li>
                    </ul>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

/**
 * Admin-chosen icon, else the category heuristic, else nothing.
 *
 * A hand-made link with no icon gets none rather than a generic box: "Gift
 * cards" beside a package outline is noise, not information.
 */
function NavIcon({ item }: { item: NavNode }) {
  const chosen =
    iconByKey(item.icon) ??
    (item.categorySlug
      ? categoryVisual(item.categorySlug, item.label).icon
      : null);
  return <Glyph icon={chosen} className="h-4 w-4" />;
}
