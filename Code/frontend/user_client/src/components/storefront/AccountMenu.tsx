"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { User as UserIcon, Package, Heart, Bell, Settings, LogOut, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Auth-aware account menu in the header (script 14). Signed-out shows sign-in /
 * register links; signed-in shows a dropdown with account, orders, wishlist, and
 * sign-out. Keyboard operable and closes on outside click / Escape.
 */
export function AccountMenu() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!isLoading && !isAuthenticated) {
    return (
      <Link
        href="/login"
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
      >
        <UserIcon className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
      >
        <UserIcon className="h-4 w-4" aria-hidden />
        <span className="hidden max-w-24 truncate sm:inline">
          {user?.firstName ?? "Account"}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <MenuLink href="/account" icon={LayoutDashboard} onClick={() => setOpen(false)}>
            My account
          </MenuLink>
          <MenuLink href="/account/orders" icon={Package} onClick={() => setOpen(false)}>
            Orders
          </MenuLink>
          <MenuLink href="/account/notifications" icon={Bell} onClick={() => setOpen(false)}>
            Notifications
          </MenuLink>
          <MenuLink href="/wishlist" icon={Heart} onClick={() => setOpen(false)}>
            Wishlist
          </MenuLink>
          <MenuLink href="/account/settings" icon={Settings} onClick={() => setOpen(false)}>
            Privacy &amp; data
          </MenuLink>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  children,
  onClick,
}: {
  href: string;
  icon: typeof Package;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
    >
      <Icon className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}
