"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight, dependency-free charts (script 15, Task 2). Rendered as inline SVG
 * / CSS so they inherit the brand theme tokens directly (series use `--color-*`
 * via Tailwind's fill-/stroke- utilities), need no external lib (no
 * React-19/compiler friction), and stay crisp in dark + light. Encoding is never
 * color-only — every series has a label/legend and values are printed. Motion is
 * CSS-transition-only (respects prefers-reduced-motion globally).
 *
 * The `chart-1..5` tokens are a single-hue LIGHTNESS ramp rather than five
 * different hues (src/theme/brand.ts → palette.series). Adjacent bars
 * are still separable, and they stay separable in greyscale and under every form
 * of colour-blindness — which five arbitrary brand hues did not guarantee.
 */

export function ChartCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export interface LinePoint {
  label: string;
  value: number;
}

/**
 * Revenue-over-time line chart. `formatValue` renders the axis/tooltip figure
 * (money via formatCents). Hovering a point reveals its exact value.
 */
export function LineChart({
  points,
  formatValue,
  height = 200,
}: {
  points: LinePoint[];
  formatValue: (value: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const padX = 8;
  const padY = 16;

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No data in this range.
      </div>
    );
  }

  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX =
    points.length > 1 ? (W - padX * 2) / (points.length - 1) : 0;
  const x = (i: number) => padX + i * stepX;
  const y = (v: number) => padY + (H - padY * 2) * (1 - v / max);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`)
    .join(" ");
  const areaPath =
    `M ${x(0)} ${H - padY} ` +
    points.map((p, i) => `L ${x(i)} ${y(p.value)}`).join(" ") +
    ` L ${x(points.length - 1)} ${H - padY} Z`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Revenue trend, peak ${formatValue(max)}`}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
      >
        {/* gridlines */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={padX}
            x2={W - padX}
            y1={padY + (H - padY * 2) * (1 - f)}
            y2={padY + (H - padY * 2) * (1 - f)}
            className="stroke-border"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ))}

        {/* Flat tint under the line — it was a two-stop cyan-to-violet ramp,
         * which is a gradient and a second hue for no gain in legibility. */}
        <path d={areaPath} className="fill-chart-1/15" />
        <path
          d={linePath}
          className="fill-none stroke-chart-1"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <g key={i}>
            {/* invisible wide hit target */}
            <rect
              x={x(i) - stepX / 2}
              y={0}
              width={stepX || W}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={hover === i ? 5 : 2.5}
              className="fill-chart-1"
            />
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none mt-1 text-center text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            {formatValue(points[hover].value)}
          </span>{" "}
          · {points[hover].label}
        </div>
      )}
    </div>
  );
}

export interface BarItem {
  label: string;
  value: number;
  sublabel?: string;
}

/**
 * Horizontal bar chart for ranked lists (e.g. top products). Every bar is the
 * same colour: this is ONE series, and cycling five hues through it implied a
 * categorical difference between rows that doesn't exist — the only thing
 * separating them is rank, which the length already shows. The label and
 * formatted value sit beside every bar, so the ranking never depends on colour
 * at all.
 */
export function HorizontalBarChart({
  items,
  formatValue,
  emptyMessage = "No data in this range.",
}: {
  items: BarItem[];
  formatValue: (value: number) => string;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatValue(item.value)}
              {item.sublabel ? ` · ${item.sublabel}` : ""}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-1 transition-[width] duration-500"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
