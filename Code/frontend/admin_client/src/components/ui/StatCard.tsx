import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./Skeleton";

/**
 * KPI stat card (script 15, FR-801). Shows a primary value with an optional
 * secondary line and icon. `loading` renders a skeleton in place of the value.
 *
 * Every card is identical apart from its words and its number. A previous
 * revision gave each one an `accent` — a coloured top rule and a gradient icon
 * chip, six hues across eight cards — on the theory that colour would help you
 * group them. It didn't: the grouping is already carried by the row a card sits
 * in and by its label, and the hues just made the grid loud. What actually
 * separates these cards is the figure, so the figure is the only thing that gets
 * emphasis (heading font, bold, tabular).
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 text-card-foreground transition-colors hover:border-primary/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-8 w-28" />
      ) : (
        <div className="mt-2 font-heading text-2xl font-bold tabular-nums">
          {value}
        </div>
      )}

      {hint && !loading && (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
