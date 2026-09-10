/**
 * Money + display helpers for the storefront. All prices are integer cents on
 * the wire (SRD); these convert for display only.
 */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Format integer cents as a localized currency string, e.g. 1999 → "$19.99". */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return USD.format(cents / 100);
}

/**
 * Format a min/max cents range: a single price when equal (or max missing),
 * otherwise "from $X" style is avoided in favor of an explicit range.
 */
export function formatPriceRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (min == null && max == null) return "—";
  if (min == null) return formatCents(max);
  if (max == null || min === max) return formatCents(min);
  return `${formatCents(min)} – ${formatCents(max)}`;
}

/** Dollars (possibly fractional) → integer cents, rounded. */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Integer cents → dollars (number), for prefilling inputs. */
export function centsToDollars(cents: number): number {
  return cents / 100;
}
