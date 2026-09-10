"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Package, Search } from "lucide-react";
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
 * links to the full detail page.
 */
export function OrderHistoryView() {
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");

  const query = useMemo(
    () => ({
      status: status || undefined,
      search: search || undefined,
      from: from || undefined,
    }),
    [status, search, from],
  );

  const { data: orders, isPending, isError } = useMyOrders(query);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Your orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track, review, and return your Techistan purchases.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order number"
            aria-label="Search order number"
            className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus | "")}
          aria-label="Filter by status"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          onChange={(e) => setFrom(e.target.value)}
          aria-label="Orders since"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {isPending ? (
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      ) : isError ? (
        <p className="py-20 text-center text-destructive">
          Could not load your orders.
        </p>
      ) : orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <Package
            className="mx-auto h-10 w-10 text-muted-foreground"
            aria-hidden
          />
          <p className="mt-3 text-sm text-muted-foreground">
            No orders match your filters yet.
          </p>
          <Link
            href="/search"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/account/orders/${o.id}`}
                className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{o.orderNumber}</span>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
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
      )}
    </div>
  );
}
