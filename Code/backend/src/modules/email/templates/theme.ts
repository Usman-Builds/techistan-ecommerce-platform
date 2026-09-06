// Email theme bridge (script 16, FR-903). Converts the shared brand tokens
// (raw HSL triplets) into the concrete hex colors + font stacks that email
// clients understand inline — so a single edit to Code/shared/theme/brand.ts
// (copied here by gen:brand) re-themes every transactional email AND both
// storefronts. No hardcoded hex/font lives in the templates themselves.
import { brand } from '../../../shared/brand.generated';

/** Parse a raw "H S% L%" triplet into a #rrggbb hex string. */
function hslTripletToHex(triplet: string): string {
  const parts = triplet.trim().split(/\s+/);
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];

  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

const p = brand.palette;

export const emailTheme = {
  storeName: brand.name,
  fonts: {
    body: `"${brand.fonts.body}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
    heading: `"${brand.fonts.heading}", Georgia, "Times New Roman", serif`,
  },
  // "0.5rem" → 8px for inline email styles.
  radiusPx: Math.round(parseFloat(brand.radius) * 16),
  colors: {
    primary: hslTripletToHex(p.brand.DEFAULT),
    primaryFg: hslTripletToHex(p.brand.fg),
    accent: hslTripletToHex(p.brandDeep.DEFAULT),
    text: hslTripletToHex(p.neutral[800]),
    heading: hslTripletToHex(p.neutral[900]),
    muted: hslTripletToHex(p.neutral[500]),
    border: hslTripletToHex(p.neutral[200]),
    subtle: hslTripletToHex(p.neutral[100]),
    pageBg: hslTripletToHex(p.neutral[50]),
    card: '#ffffff',
    success: hslTripletToHex(p.success.DEFAULT),
    warning: hslTripletToHex(p.warning.DEFAULT),
    destructive: hslTripletToHex(p.destructive.DEFAULT),
  },
} as const;

export type EmailTheme = typeof emailTheme;
