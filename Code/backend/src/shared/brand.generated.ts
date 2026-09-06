// ⚠️  GENERATED FILE — DO NOT EDIT.
// Produced by scripts/gen-brand.mjs from Code/shared/theme/brand.ts on prebuild/
// prestart. Edit the shared source, not this copy.

// ─────────────────────────────────────────────────────────────────────────────
// Techistan BRAND — SINGLE SOURCE OF TRUTH for the entire platform.
//
// EDIT THIS FILE TO RE-BRAND EVERYTHING (both Next.js clients + transactional
// emails). After editing, run `npm run gen:theme` in each client — it runs
// automatically on `predev`/`prebuild`, so a normal `npm run dev` / `npm run
// build` already picks up your changes. No other source file needs to change.
//
// Colors are raw HSL triplets "H S% L%" (no `hsl(...)` wrapper) so they compose
// in CSS as `hsl(var(--token))` and can be alpha-adjusted with `/ <alpha>`.
//
// This file is framework-agnostic: NO React / Next / DOM imports. It is consumed
// by both clients AND by the backend email templates (script 16).
// ─────────────────────────────────────────────────────────────────────────────
export const brand = {
  name: "Techistan",

  // ───────────────────────────────────────────────────────────────────────────
  // TYPE — one neutral grotesk family doing all the work, the way a premium
  // hardware brand sets its site.
  //
  // Geist is the display face: SF-Pro-adjacent proportions, closed apertures,
  // and it holds up at the large tight-tracked sizes the hero and section
  // headings use. Inter carries body and UI copy, where its taller x-height and
  // hinting win at 13-15px.
  //
  // Hierarchy here comes from SIZE, WEIGHT and LETTER-SPACING rather than from
  // a decorative second family — the optical tracking ladder lives in the
  // `@layer base` block of each client's globals.css (tight as type grows, wide
  // for the small all-caps `.eyebrow`). That is the whole trick: restraint reads
  // as expensive, a display serif over black and gold reads as a wedding
  // invitation.
  //
  // NOTE: next/font requires a STATIC import per family, so each client
  // statically imports these two families and maps them to --font-heading /
  // --font-body. Swapping between already-imported families is a pure edit here;
  // introducing a brand-new family also needs a one-line import in each client's
  // layout (documented there). Keep these names in sync with those imports.
  fonts: {
    heading: "Geist",
    body: "Inter",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // PALETTE — pitch black and gold.
  //
  // Two rules make this work rather than look like a hazard sign:
  //
  // 1. THE NEUTRALS ARE ACTUALLY NEUTRAL. Every grey is hue-0 / 0% saturation
  //    in light mode and carries at most 4-5% of a warm tint in dark mode. The
  //    previous palette tinted everything ~220° blue, which fights gold badly
  //    and stops a "black" background from ever reading as black.
  //
  // 2. GOLD IS THE ONLY ACCENT, AND IT IS EARNED. One brand hue carries all
  //    interactive and promotional emphasis; structure is carried by neutrals,
  //    weight and spacing. `success` / `warning` / `destructive` report state
  //    and are never decorative — which is why `warning` moved off amber (see
  //    below): a warning that looks like the brand colour is not a warning.
  // ───────────────────────────────────────────────────────────────────────────
  palette: {
    /**
     * The single brand hue.
     *
     * The two modes need genuinely different lightness values because
     * `--primary` is used BOTH as a fill (`bg-primary text-primary-foreground`)
     * and as text (`text-primary`, 130+ call sites). Full-strength gold is
     * perfect as text on black (13.9:1) and illegible as text on white (1.6:1),
     * so light mode gets the same hue driven down to a deep bronze that clears
     * AA in both roles, and dark mode gets the real thing.
     *
     * `dark` is #FFCC00 — the same yellow Apple ships as a system colour, and
     * the reason this palette reads premium rather than high-vis: it is a warm,
     * slightly orange gold, not a green-leaning lemon.
     */
    brand: {
      DEFAULT: "40 100% 30%", // light mode — 4.9:1 as text on white, 4.9:1 under white text
      fg: "0 0% 100%",
      dark: "48 100% 50%", // dark mode — 13.9:1 on pitch black
      darkFg: "0 0% 4%",
    },

    /** Not a second colour. The near-black the gold sits ON when the brand needs
     *  to stack on itself — email mastheads, pressed states, the inverse chip. */
    brandDeep: { DEFAULT: "0 0% 7%", fg: "48 100% 50%" },

    /**
     * Chart/series ramp. A single-hue ladder rather than a rainbow: adjacent
     * series are separated by LIGHTNESS and saturation, which survives
     * greyscale printing and every form of colour-blindness. The dark ramp
     * deliberately never drops below ~45% lightness — a dark gold on a pitch
     * black ground disappears. Every chart also prints its labels and values,
     * so the ramp is a grouping cue and never the sole signal.
     */
    series: {
      light: [
        "40 100% 30%",
        "42 78% 38%",
        "44 52% 46%",
        "42 30% 56%",
        "40 16% 66%",
      ],
      dark: [
        "48 100% 58%",
        "46 88% 50%",
        "44 58% 47%",
        "42 32% 50%",
        "40 14% 56%",
      ],
    },

    /**
     * Page/panel grounds. Kept OUT of the neutral ramp because the light ramp
     * doubles as dark-mode text.
     *
     * `dark` is literally 0% lightness — pitch black, no compromise — and the
     * elevated surfaces above it climb in small steps with a 4-5% warm tint, so
     * a card reads as lifted off the page rather than as a grey rectangle. That
     * trace of warmth is what keeps a pure-black UI from looking like a
     * terminal next to a gold accent.
     */
    surface: {
      light: "40 20% 98%", // light page background — warm paper, not blue-white
      lightMuted: "40 14% 94%", // light muted panels / secondary
      lightBorder: "40 10% 87%",
      dark: "0 0% 0%", // PITCH BLACK page background
      darkCard: "45 4% 7%",
      darkMuted: "45 4% 13%",
      darkBorder: "45 5% 18%",
    },

    /** Pure greyscale. Nothing in this system is tinted except the brand. */
    neutral: {
      50: "0 0% 98%",
      100: "0 0% 96%",
      200: "0 0% 90%",
      300: "0 0% 83%",
      400: "0 0% 64%",
      500: "0 0% 45%",
      600: "0 0% 35%",
      700: "0 0% 27%",
      800: "0 0% 17%",
      900: "0 0% 9%",
      950: "0 0% 4%",
    },

    // State only. Never used as decoration — if one of these appears, it is
    // reporting something about the data.
    //
    // `warning` used to be amber (38°), which is now the brand hue. It moved to
    // a clear orange so "low stock" and "pending" cannot be mistaken for a
    // promotional highlight.
    //
    // Each state carries a light/dark PAIR for the same reason the brand does:
    // one lightness cannot clear AA against both a white page and a black one.
    // A single mid-tone green reads at 3.1:1 on white — under the 4.5:1 floor
    // for the small text a status pill is made of. Solid fills in dark mode
    // take near-black text, matching the gold button, so every filled control
    // in the dark theme is dark-on-bright.
    success: {
      DEFAULT: "152 70% 28%",
      fg: "0 0% 100%",
      dark: "152 60% 55%",
      darkFg: "0 0% 6%",
    },
    warning: {
      DEFAULT: "22 92% 40%",
      fg: "0 0% 100%",
      dark: "22 95% 58%",
      darkFg: "0 0% 6%",
    },
    destructive: {
      DEFAULT: "358 75% 44%",
      fg: "0 0% 100%",
      dark: "358 85% 63%",
      darkFg: "0 0% 6%",
    },
  },

  radius: "0.75rem", // buttons/cards derive md/sm from this
} as const;

export type Brand = typeof brand;
