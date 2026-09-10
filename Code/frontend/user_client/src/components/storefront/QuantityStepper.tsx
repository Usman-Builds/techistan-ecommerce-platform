"use client";

import { Minus, Plus } from "lucide-react";

/**
 * Small +/- quantity control (script 09). `max` reflects live stock so the UI
 * can't request more than is available; the server clamps regardless (FR-303).
 */
export function QuantityStepper({
  value,
  min = 1,
  max,
  disabled,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const atMin = value <= min;
  const atMax = max != null && value >= max;

  return (
    <div className="inline-flex items-center rounded-md border border-border">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || atMin}
        onClick={() => onChange(value - 1)}
        className="grid h-8 w-8 place-items-center rounded-l-md text-foreground hover:bg-muted disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span
        className="min-w-8 px-1 text-center text-sm tabular-nums"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || atMax}
        onClick={() => onChange(value + 1)}
        className="grid h-8 w-8 place-items-center rounded-r-md text-foreground hover:bg-muted disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
