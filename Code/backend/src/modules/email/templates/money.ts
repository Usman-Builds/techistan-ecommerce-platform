// Money in emails is ALWAYS derived from integer cents in the store currency
// (FR-503/FR-902) — formatted for display only, never stored/passed as a float.
export function formatMoney(cents: number, currency = 'USD'): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(safe / 100);
  } catch {
    // Unknown currency code → fall back to a plain 2-dp amount + code.
    return `${(safe / 100).toFixed(2)} ${currency}`;
  }
}
