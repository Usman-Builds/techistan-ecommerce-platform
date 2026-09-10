"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  CalendarRange,
  CircleDollarSign,
  DollarSign,
  Percent,
  ShoppingCart,
  Star,
  TrendingUp,
} from "lucide-react";
import {
  useConversion,
  useOrderStats,
  useRevenueSummary,
  useTopProducts,
} from "@/lib/api/hooks/analytics";
import { useLowStock } from "@/lib/api/hooks/inventory";
import { useReviewQueue } from "@/lib/api/hooks/reviews";
import { StatCard } from "@/components/ui/StatCard";
import {
  ChartCard,
  HorizontalBarChart,
  LineChart,
  type LinePoint,
} from "@/components/ui/Chart";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "year", label: "This year", days: 0 },
] as const;

type PresetKey = (typeof PRESETS)[number]["key"];

function computeRange(preset: PresetKey): { from: string; to: string } {
  const to = new Date();
  const from =
    preset === "year"
      ? new Date(to.getFullYear(), 0, 1)
      : new Date(
          to.getTime() -
            (PRESETS.find((p) => p.key === preset)!.days - 1) *
              24 *
              60 *
              60 *
              1000,
        );
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function DashboardView() {
  const [preset, setPreset] = useState<PresetKey>("30d");
  const range = useMemo(() => computeRange(preset), [preset]);

  const summary = useRevenueSummary();
  const conversion = useConversion(range);
  const stats = useOrderStats(range);
  const top = useTopProducts(range, 8);
  const lowStock = useLowStock();
  const pendingReviews = useReviewQueue({ status: "PENDING", page: 1, pageSize: 1 });

  const currency = summary.data?.currency ?? conversion.data?.currency ?? "USD";
  const fmt = (c: number) => formatCents(c, currency);

  const linePoints: LinePoint[] = (stats.data?.series ?? []).map((s) => ({
    label: new Date(s.date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    value: s.revenueCents,
  }));

  const bars = (top.data ?? []).map((p) => ({
    label: p.title,
    value: p.revenueCents,
    sublabel: `${p.unitsSold} sold`,
  }));

  const activePreset = PRESETS.find((p) => p.key === preset)!;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Page header. This used to be a three-stop primary→violet→pink panel
       * with two blurred colour blobs floating over it — the single loudest
       * thing in the admin, above the numbers it was supposed to frame. It is
       * now plain type on the page ground, with the range control beside it so
       * every figure below is still read in its context. */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarRange className="h-4 w-4" aria-hidden />
            Showing the last {activePreset.label.toLowerCase()}
          </p>
        </div>

        <div
          className="flex items-center gap-1 rounded-full border border-border bg-card p-1"
          role="group"
          aria-label="Date range"
        >
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              aria-pressed={preset === p.key}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                preset === p.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {/* Fixed revenue windows */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue today"
          icon={DollarSign}
          loading={summary.isLoading}
          value={fmt(summary.data?.today.revenueCents ?? 0)}
          hint={`${summary.data?.today.orderCount ?? 0} orders`}
        />
        <StatCard
          label="Revenue this week"
          icon={CircleDollarSign}
          loading={summary.isLoading}
          value={fmt(summary.data?.week.revenueCents ?? 0)}
          hint={`${summary.data?.week.orderCount ?? 0} orders`}
        />
        <StatCard
          label="Revenue this month"
          icon={DollarSign}
          loading={summary.isLoading}
          value={fmt(summary.data?.month.revenueCents ?? 0)}
          hint={`${summary.data?.month.orderCount ?? 0} orders`}
        />
        <StatCard
          label="Revenue this year"
          icon={TrendingUp}
          loading={summary.isLoading}
          value={fmt(summary.data?.year.revenueCents ?? 0)}
          hint={`${summary.data?.year.orderCount ?? 0} orders`}
        />
      </div>

      {/* Range KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Orders (range)"
          icon={ShoppingCart}
          loading={stats.isLoading}
          value={(stats.data?.totalOrders ?? 0).toLocaleString()}
        />
        <StatCard
          label="Paid orders"
          icon={ShoppingCart}
          loading={conversion.isLoading}
          value={(conversion.data?.paidOrders ?? 0).toLocaleString()}
          hint={`${conversion.data?.cartsCreated ?? 0} carts started`}
        />
        <StatCard
          label="Conversion"
          icon={Percent}
          loading={conversion.isLoading}
          value={`${((conversion.data?.conversionRate ?? 0) * 100).toFixed(1)}%`}
          hint="Paid orders ÷ carts"
        />
        <StatCard
          label="Avg order value"
          icon={DollarSign}
          loading={conversion.isLoading}
          value={fmt(conversion.data?.aovCents ?? 0)}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard
          title="Revenue over time"
          className="lg:col-span-3"
        >
          {stats.isLoading ? (
            <div className="h-[200px] animate-pulse rounded-xl bg-muted" />
          ) : (
            <LineChart points={linePoints} formatValue={fmt} />
          )}
        </ChartCard>
        <ChartCard
          title="Top products"
          className="lg:col-span-2"
          action={
            <Link
              href="/products"
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              View all
            </Link>
          }
        >
          {top.isLoading ? (
            <div className="h-[200px] animate-pulse rounded-xl bg-muted" />
          ) : (
            <HorizontalBarChart items={bars} formatValue={fmt} />
          )}
        </ChartCard>
      </div>

      {/* Alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AlertPanel
          title="Low stock"
          icon={Boxes}
          count={lowStock.data?.items.length ?? 0}
          href="/inventory"
          loading={lowStock.isLoading}
          emptyText="All variants above threshold."
        >
          <ul className="divide-y divide-border">
            {(lowStock.data?.items ?? []).slice(0, 5).map((it) => (
              <li key={it.variantId} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate">
                  {it.productTitle}{" "}
                  <span className="text-muted-foreground">· {it.sku}</span>
                </span>
                <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
                  {it.stock} left
                </span>
              </li>
            ))}
          </ul>
        </AlertPanel>

        <AlertPanel
          title="Pending reviews"
          icon={Star}
          count={pendingReviews.data?.total ?? 0}
          href="/reviews"
          loading={pendingReviews.isLoading}
          emptyText="No reviews awaiting moderation."
        >
          <p className="py-2 text-sm text-muted-foreground">
            {pendingReviews.data?.total ?? 0} review
            {(pendingReviews.data?.total ?? 0) === 1 ? "" : "s"} awaiting moderation.
          </p>
        </AlertPanel>
      </div>
    </div>
  );
}

function AlertPanel({
  title,
  icon: Icon,
  count,
  href,
  loading,
  emptyText,
  children,
}: {
  title: string;
  icon: typeof AlertTriangle;
  count: number;
  href: string;
  loading?: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
          <span
            className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Icon className="h-4 w-4" />
          </span>
          {title}
          {count > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {count}
            </span>
          )}
        </h2>
        <Link
          href={href}
          className="rounded-full px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
        >
          Manage
        </Link>
      </div>
      {loading ? (
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
      ) : count === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        children
      )}
    </div>
  );
}
