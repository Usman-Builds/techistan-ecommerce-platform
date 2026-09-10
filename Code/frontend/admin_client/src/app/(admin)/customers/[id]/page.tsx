"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Ban, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { useCustomer, useSetCustomerStatus } from "@/lib/api/hooks/customers";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatCents } from "@/lib/format";
import { ApiError } from "@/lib/api/client";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: c, isLoading, isError } = useCustomer(id);
  const setStatus = useSetCustomerStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }
  if (isError || !c) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="text-destructive">Customer not found.</p>
        <Link href="/customers" className="mt-3 inline-block text-sm text-primary hover:underline">
          Back to customers
        </Link>
      </div>
    );
  }

  const banned = c.status === "BANNED";

  const applyStatus = async () => {
    setError(null);
    try {
      await setStatus.mutateAsync({ id, status: banned ? "ACTIVE" : "BANNED" });
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status.");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Customers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 font-heading text-2xl font-bold">
            {c.firstName} {c.lastName}
            <StatusBadge status={c.status} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{c.email}</p>
          {c.phoneNumber && (
            <p className="text-sm text-muted-foreground">{c.phoneNumber}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            banned
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "border border-destructive/50 text-destructive hover:bg-destructive/10"
          }`}
        >
          {banned ? (
            <>
              <ShieldCheck className="h-4 w-4" aria-hidden /> Reactivate account
            </>
          ) : (
            <>
              <Ban className="h-4 w-4" aria-hidden /> Ban customer
            </>
          )}
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Lifetime spend</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatCents(c.lifetimeSpentCents)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Paid orders</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{c.paidOrderCount}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Member since</div>
          <div className="mt-1 text-xl font-semibold">
            {new Date(c.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Addresses */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold">
          <MapPin className="h-5 w-5" aria-hidden /> Addresses
        </h2>
        {c.addresses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved addresses.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {c.addresses.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-card p-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.fullName}</span>
                  {a.isDefault && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      Default
                    </span>
                  )}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}
                  <br />
                  {a.city}, {a.state} {a.postalCode}, {a.country}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Order history */}
      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold">Order history</h2>
        {c.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {c.orders.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/orders/${o.id}`} className="text-primary hover:underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatCents(o.grandTotal, o.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title={banned ? "Reactivate this account?" : "Ban this customer?"}
        description={
          banned
            ? "The customer will be able to sign in and place orders again."
            : "The customer will be signed out and blocked from logging in. Existing orders are unaffected."
        }
        confirmLabel={banned ? "Reactivate" : "Ban customer"}
        tone={banned ? "primary" : "danger"}
        loading={setStatus.isPending}
        onConfirm={applyStatus}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
