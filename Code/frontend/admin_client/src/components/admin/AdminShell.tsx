"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingCart,
  Users,
  Boxes,
  Ticket,
  Percent,
  Tags,
  Star,
  LayoutTemplate,
  Menu as MenuIcon,
  Image as ImageIcon,
  Settings,
  ScrollText,
  Bell,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { User } from "@/lib/api/auth";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { AdminLogo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

/**
 * Sidebar navigation, grouped by what the admin is actually doing.
 *
 * The flat 14-item list this replaces made every screen look equidistant, so
 * finding "Coupons" meant reading all fourteen labels. The GROUPING is what fixes
 * that — each item now has a stable position under a heading you can aim at.
 *
 * An intermediate revision also gave every item its own accent colour. That was
 * fourteen coloured chips in a 240px column, which is decoration pretending to be
 * information: the icon and the label already identify the row, and only one row
 * at a time is actually special (the active one). So exactly one row is coloured.
 */
const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    heading: "Catalog",
    items: [
      { href: "/products", label: "Products", icon: Package },
      { href: "/categories", label: "Categories", icon: FolderTree },
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/media", label: "Media", icon: ImageIcon },
    ],
  },
  {
    heading: "Storefront",
    items: [
      { href: "/homepage", label: "Homepage", icon: LayoutTemplate },
      { href: "/navigation", label: "Navigation", icon: MenuIcon },
    ],
  },
  {
    heading: "Selling",
    items: [
      { href: "/orders", label: "Orders", icon: ShoppingCart },
      { href: "/coupons", label: "Coupons", icon: Ticket },
      { href: "/discounts", label: "Discounts", icon: Percent },
      { href: "/sales", label: "Sales", icon: Tags },
    ],
  },
  {
    heading: "People",
    items: [
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    heading: "System",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/audit-log", label: "Audit Log", icon: ScrollText },
    ],
  },
];

export function AdminShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const signOut = async () => {
    await logout();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.heading}>
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {group.heading}
          </p>
          <ul className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = <AdminLogo />;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center border-b border-border px-4">
          {brand}
        </div>
        {nav}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-card">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              {brand}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/90 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="text-muted-foreground hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <ThemeToggle />
            <div className="flex items-center gap-2">
              {/* Initials avatar — makes "who am I signed in as" readable at a
               * glance without needing the name to be on screen. */}
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-bold text-foreground"
                aria-hidden
              >
                {(user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "") || "A"}
              </span>
              <div className="hidden text-right sm:block">
                <div className="text-sm font-semibold leading-tight">
                  {user.firstName} {user.lastName}
                </div>
                <div className="text-xs text-muted-foreground">{user.role}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
