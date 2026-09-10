"use client";

/**
 * Storefront notifications page (script 16, Task 9). Paginated list of the
 * shopper's order/promotion updates with per-item and "mark all read" actions.
 * Auth-gated by the account group layout (server redirect). Loading / empty /
 * error states; each row deep-links to its order. All data via apiClient.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { notificationHref, type NotificationItem } from "@/lib/api/notifications";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "@/lib/api/hooks/notifications";

const PAGE_SIZE = 15;

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

export default function AccountNotificationsPage() {
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
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold">Notifications</h1>
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending || unreadCount === 0}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          <CheckCheck className="h-4 w-4" aria-hidden /> Mark all read
        </button>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={(e) => {
            setUnreadOnly(e.target.checked);
            setPage(1);
          }}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        Unread only{unreadCount > 0 ? ` (${unreadCount})` : ""}
      </label>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {isLoading ? (
          <ul className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="animate-pulse p-4">
                <div className="h-4 w-1/2 rounded bg-muted" />
                <div className="mt-2 h-3 w-3/4 rounded bg-muted" />
              </li>
            ))}
          </ul>
        ) : isError ? (
          <div className="p-10 text-center">
            <p className="text-sm text-destructive">Couldn’t load your notifications.</p>
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
                        <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
            >
              Next <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
