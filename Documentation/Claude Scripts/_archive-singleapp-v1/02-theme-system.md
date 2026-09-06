# 02 — Theme System (Brand + Dark/Light)

**Goal:** Build a **single-source-of-truth theme system**. Re-branding the entire app (colors, fonts, radius) must require editing **only `src/theme/brand.ts`**. Full dark + light support with a user toggle and system preference. This is a core user requirement — do it thoroughly.

**Prerequisites:** Script `01` complete (Tailwind v4, Shadcn CSS-variables mode, `next-themes` installed).

---

## Design principles

1. **One brand file.** `src/theme/brand.ts` holds every brand primitive. Nothing else hardcodes a hex/font.
2. **Semantic tokens, not raw colors.** Components use `bg-primary`, `text-muted-foreground`, etc. — never `bg-[#...]`.
3. **Light + dark are two token maps** derived from the same brand palette.
4. **CSS variables** bridge brand file → Tailwind/Shadcn. Toggling `.dark` on `<html>` swaps the map.

---

## Tasks

### 1. Brand source file — `src/theme/brand.ts`
Define the brand as typed objects. This is the **only** file to edit when re-theming.

```ts
// src/theme/brand.ts  — EDIT THIS FILE TO RE-BRAND THE WHOLE APP
export const brand = {
  name: "ShopForge",

  // Fonts (loaded via next/font in layout). Change here to swap typography.
  fonts: {
    heading: "Playfair Display",
    body: "Inter",
  },

  // Core brand palette — raw HSL triplets "H S% L%".
  palette: {
    brand:   { DEFAULT: "222 89% 55%", fg: "0 0% 100%" }, // primary accent
    accent:  { DEFAULT: "160 84% 39%", fg: "0 0% 100%" },
    neutral: { 50:"210 20% 98%", 100:"220 14% 96%", 200:"220 13% 91%",
               300:"216 12% 84%", 400:"218 11% 65%", 500:"220 9% 46%",
               600:"215 14% 34%", 700:"217 19% 27%", 800:"215 28% 17%",
               900:"221 39% 11%", 950:"224 71% 4%" },
    success: { DEFAULT: "142 71% 45%", fg: "0 0% 100%" },
    warning: { DEFAULT: "38 92% 50%",  fg: "0 0% 100%" },
    destructive: { DEFAULT: "0 84% 60%", fg: "0 0% 100%" },
  },

  radius: "0.5rem",   // 8px buttons / 6px cards derive from this
} as const;
```

### 2. Semantic token maps — `src/theme/tokens.ts`
Map brand primitives → **semantic tokens** for light and dark. These are the names Shadcn/Tailwind consume (`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `border`, `input`, `ring`, `destructive`, `success`, `warning`, plus `*-foreground`).

```ts
// src/theme/tokens.ts
import { brand } from "./brand";
const n = brand.palette.neutral;

export const lightTokens = {
  background: n[50], foreground: n[900],
  card: "0 0% 100%", "card-foreground": n[900],
  popover: "0 0% 100%", "popover-foreground": n[900],
  primary: brand.palette.brand.DEFAULT, "primary-foreground": brand.palette.brand.fg,
  secondary: n[100], "secondary-foreground": n[900],
  muted: n[100], "muted-foreground": n[500],
  accent: brand.palette.accent.DEFAULT, "accent-foreground": brand.palette.accent.fg,
  border: n[200], input: n[200], ring: brand.palette.brand.DEFAULT,
  destructive: brand.palette.destructive.DEFAULT, "destructive-foreground": brand.palette.destructive.fg,
  success: brand.palette.success.DEFAULT, "success-foreground": brand.palette.success.fg,
  warning: brand.palette.warning.DEFAULT, "warning-foreground": brand.palette.warning.fg,
} as const;

export const darkTokens = {
  background: n[950], foreground: n[100],
  card: n[900], "card-foreground": n[100],
  popover: n[900], "popover-foreground": n[100],
  primary: brand.palette.brand.DEFAULT, "primary-foreground": brand.palette.brand.fg,
  secondary: n[800], "secondary-foreground": n[100],
  muted: n[800], "muted-foreground": n[400],
  accent: brand.palette.accent.DEFAULT, "accent-foreground": brand.palette.accent.fg,
  border: n[800], input: n[800], ring: brand.palette.brand.DEFAULT,
  destructive: brand.palette.destructive.DEFAULT, "destructive-foreground": brand.palette.destructive.fg,
  success: brand.palette.success.DEFAULT, "success-foreground": brand.palette.success.fg,
  warning: brand.palette.warning.DEFAULT, "warning-foreground": brand.palette.warning.fg,
} as const;
```

### 3. Emit CSS variables — `src/styles/globals.css`
Write a small codegen helper **or** hand-map the token objects into CSS custom properties so `:root` = light and `.dark` = dark. Each token becomes `--background: <hsl triplet>;` and colors are consumed as `hsl(var(--background))`.

- `:root { --background: 210 20% 98%; ... --radius: 0.5rem; }`
- `.dark { --background: 224 71% 4%; ... }`
- Set `color-scheme` appropriately in each block.

> Keep the CSS var names in sync with `tokens.ts`. Prefer generating them at build time from the token objects (a `scripts/gen-theme-css.ts` run in `predev`/`prebuild`) so the CSS **cannot drift** from `brand.ts`. If generating is overkill, add a comment in `globals.css` pointing to `tokens.ts` as the source.

### 4. Tailwind config consumes the variables
Extend Tailwind's theme so every semantic token maps to its CSS var:
```
colors: {
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
  /* ...all tokens... */
  success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
},
borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" }
```

### 5. Fonts from the brand file
In root `layout.tsx`, load fonts via `next/font/google` using `brand.fonts`. Expose them as CSS vars (`--font-heading`, `--font-body`) and wire into Tailwind `fontFamily`. Changing `brand.fonts` swaps typography app-wide.

### 6. ThemeProvider + toggle
- `src/theme/ThemeProvider.tsx` wrapping `next-themes` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`). Add to root layout.
- `src/components/shared/ThemeToggle.tsx` — accessible button (Light / Dark / System) using `useTheme`, with sun/moon icons and an `aria-label`. Avoid hydration mismatch (mount guard).
- Prevent flash of wrong theme (next-themes handles via the injected script).

### 7. Theme showcase page (temporary QA)
Add `/theme-preview` rendering swatches for every semantic token + buttons/cards/inputs in both modes, to verify contrast and the toggle. Keep it dev-only or delete after script `14`.

---

## Re-branding instructions (put this as a comment at top of `brand.ts`)
> To re-theme the entire app: edit `palette`, `fonts`, and `radius` in this file only. If using build-time CSS generation, run `pnpm gen:theme`. Nothing else needs to change.

## Acceptance criteria
- [ ] Changing a color in `src/theme/brand.ts` visibly updates the whole app (verify on `/theme-preview`) with no other file edits (or only `pnpm gen:theme`).
- [ ] Dark/light toggle works; system preference respected; no flash on reload.
- [ ] No component hardcodes a hex or font — all use semantic tokens.
- [ ] Contrast on light + dark meets ≥ 4.5:1 for body text (spot-check on preview).
- [ ] `pnpm build` passes.
