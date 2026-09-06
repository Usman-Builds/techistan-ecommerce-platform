import { formatMoney } from './money.util';

/**
 * Money is integer minor units everywhere (00 §9). These specs pin the
 * cents→string boundary: correct minor-unit handling per currency, no float
 * drift when summing integer cents, and a safe fallback for unknown codes.
 */
describe('formatMoney (integer cents → display)', () => {
  it('formats USD cents with two decimals and a symbol', () => {
    expect(formatMoney(1999, 'USD')).toBe('$19.99');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
    expect(formatMoney(5, 'USD')).toBe('$0.05');
    expect(formatMoney(100000, 'USD')).toBe('$1,000.00');
  });

  it('defaults to USD when no currency is given', () => {
    expect(formatMoney(2500)).toBe('$25.00');
  });

  it('upper-cases a lower-case currency code', () => {
    expect(formatMoney(1999, 'usd')).toBe('$19.99');
  });

  it('honors zero-decimal currencies (JPY has no minor unit)', () => {
    // 1000 is 1000 yen, not 10.00 — the divisor is 10^0, not 100.
    expect(formatMoney(1000, 'JPY')).toBe('¥1,000');
  });

  it('sums integer cents with no floating-point drift', () => {
    // Ten 10¢ line items = exactly $1.00, never $0.9999999.
    const total = Array.from({ length: 10 }, () => 10).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
    expect(formatMoney(total, 'USD')).toBe('$1.00');
  });

  it('computes a taxed line total from integer cents without rounding error', () => {
    const unit = 1999; // $19.99
    const qty = 3;
    const lineTotal = unit * qty; // 5997
    const taxBps = 725; // 7.25%
    const tax = Math.round((lineTotal * taxBps) / 10000); // 435
    expect(lineTotal).toBe(5997);
    expect(tax).toBe(435);
    expect(formatMoney(lineTotal + tax, 'USD')).toBe('$64.32');
  });

  it('falls back to a plain amount + code for an invalid currency', () => {
    // A malformed code makes Intl throw; the helper degrades gracefully.
    expect(formatMoney(1999, 'ZZ')).toBe('19.99 ZZ');
  });
});
