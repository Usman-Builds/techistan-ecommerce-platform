"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import {
  useCoupon,
  useCouponAnalytics,
  useCouponRedemptions,
  useDeleteCoupon,
} from "@/lib/api/hooks/promotions";
import { CouponForm } from "@/components/promotions/CouponForm";
import { formatCents } from "@/lib/format";

export default function EditCouponPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { data: coupon, isLoading, isError } = useCoupon(id);
  const { data: analytics } = useCouponAnalytics(id);
  const { data: redemptions } = useCouponRedemptions(id);
  const del = useDeleteCoupon();

  if (isLoading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }
  if (isError || !coupon) {
    return (
      <div className="mx-auto max-w-2xl py-24 text-center">
        <p className="text-destructive">Coupon not found.</p>
        <Back />
      </div>
    );
  }

  const onDelete = async () => {
    if (!confirm(`Delete coupon ${coupon.code}? This cannot be undone.`)) return;
    await del.mutateAsync(coupon.id);
    router.push("/coupons");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Back />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">
          <span className="font-mono">{coupon.code}</span>
        </h1>
        <button
          type="button"
          onClick={onDelete}
          disabled={del.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Delete
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <CouponForm mode="edit" coupon={coupon} />
        </div>

        <aside className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Performance</h2>
            <dl className="space-y-2 text-sm">
              <Stat label="Redemptions" value={String(analytics?.redemptionCount ?? 0)} />
              <Stat
                label="Discount given"
                value={formatCents(analytics?.totalDiscountCents ?? 0)}
              />
              <Stat
                label="Revenue attributed"
                value={formatCents(analytics?.attributedRevenueCents ?? 0)}
              />
              <Stat
                label="Avg. order value"
                value={formatCents(analytics?.averageOrderValueCents ?? 0)}
              />
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">
              Redemptions ({redemptions?.count ?? 0})
            </h2>
            {!redemptions || redemptions.count === 0 ? (
              <p className="text-sm text-muted-foreground">No redemptions yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {redemptions.redemptions.slice(0, 20).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs">
                        {r.order?.orderNumber ?? "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.user?.email ?? "guest"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs">
                      −{formatCents(r.discountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Back() {
  return (
    <Link
      href="/coupons"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to coupons
    </Link>
  );
}
