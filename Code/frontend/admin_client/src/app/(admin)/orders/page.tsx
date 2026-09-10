"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
} from "lucide-react";
import { useAdminOrders } from "@/lib/api/hooks/orders";
import type { OrderStatus, PaymentStatus } from "@/lib/api/orders";
import { formatCents } from "@/lib/format";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/orders/OrderStatusBadge";
import { FilterSelect } from "@/components/ui/FilterBar";

const PAGE_SIZE = 20;

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];

const PAYMENT_STATUSES: PaymentStatus[] = [
  "REQUIRES_PAYMENT",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
];

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "">("");
  const [from, setFrom] = useState("");

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status: status || undefined,
      paymentStatus: paymentStatus || undefined,
      from: from || undefined,
    }),
    [page, search, status, paymentStatus, from],
  );

  const { data, isLoading, isError } = useAdminOrders(query);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetPage = () => setPage(1);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total} order{total === 1 ? "" : "s"}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Order number or customer email"
            aria-label="Search orders"
            className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <FilterSelect<OrderStatus>
          label="Filter by status"
          value={status}
          onChange={(value) => {
            setStatus(value);
            resetPage();
          }}
          options={[
            { value: "", label: "All statuses" },
            ...ORDER_STATUSES.map((s) => ({
              value: s,
              label: s.charAt(0) + s.slice(1).toLowerCase(),
            })),
          ]}
        />
        <FilterSelect<PaymentStatus>
          label="Filter by payment status"
          value={paymentStatus}
          onChange={(value) => {
            setPaymentStatus(value);
            resetPage();
          }}
          options={[
            { value: "", label: "All payments" },
            ...PAYMENT_STATUSES.map((s) => ({
              value: s,
              label:
                s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " "),
            })),
          ]}
        />
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            resetPage();
          }}
          aria-label="Orders since"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Order</th>
              <th className="p-3 font-medium">Customer</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Payment</th>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden />
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-destructive">
                  Failed to load orders.
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No orders found.
                </td>
              </tr>
            ) : (
              items.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="p-3">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {o.items.length} item{o.items.length === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{o.email}</td>
                  <td className="p-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="p-3">
                    {o.paymentStatus ? (
                      <PaymentStatusBadge status={o.paymentStatus} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString("en-US")}
                  </td>
                  <td className="p-3 text-right font-medium">
                    {formatCents(o.grandTotal, o.currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 disabled:opacity-50"
          >
            Next <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
