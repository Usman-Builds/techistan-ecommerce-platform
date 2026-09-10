"use client";

/**
 * Admin notifications list (script 16, Task 10). Paginated view of every alert
 * for the signed-in admin — new orders, low stock, new reviews — with per-item
 * and bulk mark-read. Each row deep-links to its target screen. Loading / empty /
 * error states throughout; JWT-scoped server-side to the caller.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { notificationHref, type NotificationItem } from "@/lib/api/notifications";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "@/lib/api/hooks/notifications";

const PAGE_SIZE = 20;

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleString();
}

export default function NotificationsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const params = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, unreadOnly }),
    [page, unreadOnly],
  );
  const { data, isLoading, isError, refetch } = useNotifications(params);
  const { data: unread } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unreadCount = unread?.count ?? 0;

  const onItemClick = (n: NotificationItem) => {
    if (!n.readAt) markRead.mutate(n.id);
    const href = notificationHref(n);
    if (href) router.push(href);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <Bell className="h-6 w-6" aria-hidden /> Notifications
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {unreadCount} unread
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => {
                setUnreadOnly(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            Unread only
          </label>
          <button
            type="button"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending || unreadCount === 0}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" aria-hidden /> Mark all read
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 p-4">
                <Skeleton className="mt-1 h-2 w-2 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-10 text-center">
            <p className="text-sm text-destructive">Couldn’t load notifications.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">
              {unreadOnly ? "No unread notifications." : "You’re all caught up."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => {
              const clickable = notificationHref(n) !== null;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onItemClick(n)}
                    className={cn(
                      "flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                      !n.readAt && "bg-primary/5",
                      !clickable && "cursor-default",
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
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium">{n.title}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} />
    </div>
  );
}
