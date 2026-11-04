"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  Search,
} from "lucide-react";
import { useMyOrders } from "@/lib/api/hooks/orders";
import type { OrderStatus } from "@/lib/api/orders";
import { formatMoney } from "@/lib/utils/money";
import { OrderStatusBadge } from "./OrderStatusBadge";

const STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];

/**
 * Account → order history (script 11, FR-505). Lists the signed-in customer's
 * orders with status + date filters and a search on the order number. Each row
 * links to the full detail page. The list is paginated server-side (#55);
 * changing a filter goes back to the first page.
 */
export function OrderHistoryView() {
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo(
    () => ({
      status: status || undefined,
      search: search || undefined,
      from: from || undefined,
      page,
    }),
    [status, search, from, page],
  );

  const { data, isPending, isError } = useMyOrders(query);
  const orders = data?.items ?? [];
  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Your orders</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Track, review, and return your Techistan purchases.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search order number"
            aria-label="Search order number"
            className="border-input bg-background focus-visible:ring-ring w-full rounded-md border py-2 pr-3 pl-8 text-sm outline-none focus-visible:ring-2"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OrderStatus | "");
            setPage(1);
          }}
          aria-label="Filter by status"
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          aria-label="Orders since"
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
        />
      </div>

      {isPending ? (
        <div className="text-muted-foreground flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      ) : isError ? (
        <p className="text-destructive py-20 text-center">
          Could not load your orders.
        </p>
      ) : orders.length === 0 ? (
        <div className="border-border rounded-lg border border-dashed py-16 text-center">
          <Package
            className="text-muted-foreground mx-auto h-10 w-10"
            aria-hidden
          />
          <p className="text-muted-foreground mt-3 text-sm">
            No orders match your filters yet.
          </p>
          <Link
            href="/search"
            className="bg-primary text-primary-foreground mt-4 inline-block rounded-md px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/account/orders/${o.id}`}
                  className="border-border bg-card hover:border-primary/50 flex flex-wrap items-center gap-4 rounded-lg border p-4 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{o.orderNumber}</span>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      {new Date(o.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {o.items.length} item{o.items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-right font-semibold">
                    {formatMoney(o.grandTotal, o.currency)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <nav
              aria-label="Order history pages"
              className="flex items-center justify-between text-sm"
            >
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="border-border inline-flex items-center gap-1 rounded-md border px-3 py-1.5 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
              </button>
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="border-border inline-flex items-center gap-1 rounded-md border px-3 py-1.5 disabled:opacity-50"
              >
                Next <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
