/** Money helpers — the backend stores integer cents; the UI edits dollars. */

/** Format integer cents as a currency string, e.g. 1999 → "$19.99". */
export function formatCents(
  cents: number | null | undefined,
  currency = "USD",
): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Format a min/max cents range, collapsing when equal. */
export function formatPriceRange(
  min: number | null,
  max: number | null,
): string {
  if (min == null) return "—";
  if (max == null || min === max) return formatCents(min);
  return `${formatCents(min)} – ${formatCents(max)}`;
}

/** Parse a dollars string ("19.99") into integer cents. Returns null if blank. */
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return NaN;
  return Math.round(value * 100);
}

/** Render integer cents as a plain dollars string for an input value ("19.99"). */
export function centsToDollars(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}
