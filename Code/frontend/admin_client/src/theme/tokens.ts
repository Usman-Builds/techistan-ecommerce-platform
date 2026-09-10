// ─────────────────────────────────────────────────────────────────────────────
// Semantic token maps — derived from the brand palette in `brand.ts`.
// These are the names components consume (bg-primary, text-muted-foreground …).
// Two maps (light + dark) built from the SAME brand primitives, so a re-brand
// in brand.ts flows to both modes automatically.
//
// Values are HSL triplets "H S% L%" (consumed as `hsl(var(--token))`).
// Framework-agnostic — no React / Next / DOM imports.
// ─────────────────────────────────────────────────────────────────────────────
import { brand } from "./brand";

const n = brand.palette.neutral;
const s = brand.palette.surface;
const p = brand.palette;
const white = "0 0% 100%";

/** `["a","b",…]` → `{ "chart-1": "a", "chart-2": "b", … }`. */
const seriesTokens = (ramp: readonly string[]) =>
  Object.fromEntries(ramp.map((value, i) => [`chart-${i + 1}`, value]));

/**
 * Status colours. They are the only hues in the system besides the brand gold,
 * and they exist to report state (stock, ratings, failures) — not to decorate.
 *
 * Each one is a light/dark pair rather than a single value: these are used as
 * SMALL TEXT (`text-success` in a status pill) as often as they are used as
 * fills, and one mid-tone cannot clear 4.5:1 against both a white page and a
 * black one. The dark side is lighter and takes near-black text on solid fills,
 * exactly like the brand pair — so no call site needs a `dark:` override.
 */
const statusTokens = (mode: "light" | "dark") => {
  const pick = (c: {
    DEFAULT: string;
    fg: string;
    dark: string;
    darkFg: string;
  }) =>
    mode === "light"
      ? { color: c.DEFAULT, fg: c.fg }
      : { color: c.dark, fg: c.darkFg };

  const d = pick(p.destructive);
  const s = pick(p.success);
  const w = pick(p.warning);
  return {
    destructive: d.color,
    "destructive-foreground": d.fg,
    success: s.color,
    "success-foreground": s.fg,
    warning: w.color,
    "warning-foreground": w.fg,
  };
};

export const lightTokens = {
  background: s.light,
  foreground: n[900],
  card: white,
  "card-foreground": n[900],
  popover: white,
  "popover-foreground": n[900],

  primary: p.brand.DEFAULT,
  "primary-foreground": p.brand.fg,
  ring: p.brand.DEFAULT,

  secondary: s.lightMuted,
  "secondary-foreground": n[900],
  muted: s.lightMuted,
  "muted-foreground": n[500],

  // `accent` keeps its shadcn meaning: the subtle surface a menu row or list
  // item takes on hover. It is NOT a second brand colour — that is exactly the
  // mistake this revision removes.
  accent: s.lightMuted,
  "accent-foreground": n[900],

  border: s.lightBorder,
  input: s.lightBorder,

  ...statusTokens("light"),
  ...seriesTokens(p.series.light),
} as const;

export const darkTokens = {
  background: s.dark,
  foreground: n[100],
  card: s.darkCard,
  "card-foreground": n[100],
  popover: s.darkCard,
  "popover-foreground": n[100],

  // Dark mode flips the brand pair: full-strength gold with near-black text on
  // solid fills, so `bg-primary text-primary-foreground` stays readable in both
  // modes without a single `dark:` override at any call site. Light mode uses
  // the same hue driven down to a bronze, because gold on white is unreadable
  // as text and `text-primary` is used everywhere.
  primary: p.brand.dark,
  "primary-foreground": p.brand.darkFg,
  ring: p.brand.dark,

  secondary: s.darkMuted,
  "secondary-foreground": n[100],
  muted: s.darkMuted,
  "muted-foreground": n[400],

  accent: s.darkMuted,
  "accent-foreground": n[100],

  border: s.darkBorder,
  input: s.darkBorder,

  ...statusTokens("dark"),
  ...seriesTokens(p.series.dark),
} as const;

export type ThemeTokens = typeof lightTokens;
