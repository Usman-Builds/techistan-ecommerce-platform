"use client";

/**
 * Storefront notification bell (script 16, Task 9). Renders only for signed-in
 * shoppers; shows the unread count, opens a dropdown of recent order/promotion
 * updates, marks items read, and links to the full page. Accessible: keyboard +
 * Escape + click-outside close, ARIA live region on the badge, reduced-motion.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { notificationHref, type NotificationItem } from "@/lib/api/notifications";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "@/lib/api/hooks/notifications";

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const router = useRouter();

  const { data: unread } = useUnreadCount(isAuthenticated);
  const count = unread?.count ?? 0;
  const { data, isLoading, isError, refetch } = useNotifications(
    { pageSize: 8 },
    isAuthenticated && open,
  );
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const items = data?.items ?? [];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Guests get no bell — the storefront still works, they just have nothing to show.
  if (!isAuthenticated) return null;

  const onItemClick = (n: NotificationItem) => {
    if (!n.readAt) markRead.mutate(n.id);
    const href = notificationHref(n);
    setOpen(false);
    if (href) router.push(href);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {count > 0 ? `${count} unread notifications` : "No unread notifications"}
      </span>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Notifications"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {isLoading ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</p>
              ) : isError ? (
                <div className="px-4 py-6 text-center text-sm">
                  <p className="text-destructive">Couldn’t load notifications.</p>
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="mt-2 text-xs font-medium text-primary hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  You’re all caught up.
                </p>
              ) : (
                <ul>
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onItemClick(n)}
                        className={cn(
                          "flex w-full items-start gap-2 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                          !n.readAt && "bg-primary/5",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            n.readAt ? "bg-transparent" : "bg-primary",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{n.title}</span>
                          {n.body && (
                            <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                              {n.body}
                            </span>
                          )}
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {timeAgo(n.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Link
              href="/account/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center border-t border-border px-4 py-2.5 text-xs font-medium text-primary hover:bg-muted"
            >
              View all notifications
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
