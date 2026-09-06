# 02 — Theme System (Centralized Brand + Dark/Light, shared by BOTH clients)

**Goal:** A **single-source-of-truth** theme system that themes **both** Next.js clients (`user_client` storefront and `admin_client` admin panel) at once. Re-branding the whole platform — colors, fonts, radius — must require editing **only `Code/shared/theme/brand.ts`**. Full dark + light support in each client with a user toggle and system preference. This is a **core user requirement** (`00-BUILD-ORDER.md §5`) — do it thoroughly.

**Prerequisites:** Script `01` complete — both clients have deps installed (incl. `next-themes`, `lucide-react`, `clsx`, `tailwind-merge`), the `Code/shared/` workspace exists and is importable from both clients (path alias `@shared/*` + `transpilePackages`, or the `sync-theme` fallback), and each client runs (storefront `:3001`, admin `:3002`). Tailwind **v4** is CSS-first (`@import "tailwindcss"` + `@theme` in `globals.css`; there is **no** `tailwind.config.js`).

> ⚠️ **Next.js 16 caveat (`00 §7`).** Before writing client code, read the relevant guides under each client's `node_modules/next/dist/docs/` — specifically **fonts** (`next/font`), **`app` layout/metadata**, and any note on **`transpilePackages`** / cross-root imports. Do not assume Next 13/14/15 conventions. Tailwind v4 uses a CSS-first config; do not scaffold a `tailwind.config.js` unless the docs for the installed version require one.

---

## Design principles

1. **One brand file, shared.** `Code/shared/theme/brand.ts` holds every brand primitive (palette, fonts, radius). Nothing in either client hardcodes a hex or font family.
2. **Semantic tokens, not raw colors.** Components use `bg-primary`, `text-muted-foreground`, `border-border`, etc. — never `bg-[#...]`.
3. **Light + dark are two token maps** derived from the same brand palette (`tokens.ts`, also in `shared`).
4. **CSS variables bridge the shared TS → Tailwind v4.** Both clients emit the same `:root` (light) and `.dark` (dark) variable blocks from the shared token maps. `next-themes` toggles the `.dark` class on `<html>` in each client independently.
5. **Emails share the same brand.** The Resend/React-Email templates (script `16`) import `brand` from `shared/theme` too — so a re-brand flows to transactional email without extra edits.

---

## Tasks

> Track labels: **[shared]** = `Code/shared/theme`, **[user_client]** = storefront, **[admin_client]** = admin panel, **[both clients]** = do the identical step in each client app.

### 1. [shared] Brand source file — `Code/shared/theme/brand.ts`
The **only** file to edit when re-theming. Typed, framework-agnostic (no React/Next imports — it is consumed by both clients and by backend emails).

```ts
// Code/shared/theme/brand.ts
// ─────────────────────────────────────────────────────────────
// EDIT THIS FILE TO RE-BRAND THE ENTIRE PLATFORM (both clients + emails).
// Colors are raw HSL triplets "H S% L%" so they compose in CSS as hsl(var(--token)).
// After editing, re-run the theme CSS generator in each client (see Task 4).
// ─────────────────────────────────────────────────────────────
export const brand = {
  name: "ShopForge",

  // Fonts — loaded via next/font in each client's root layout. Change here to swap typography.
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

  radius: "0.5rem", // buttons/cards derive md/sm from this
} as const;
```

### 2. [shared] Semantic token maps — `Code/shared/theme/tokens.ts`
Map brand primitives → **semantic tokens** for light and dark. These are the names the clients' components consume (`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `border`, `input`, `ring`, `destructive`, `success`, `warning`, plus each `*-foreground`).

```ts
// Code/shared/theme/tokens.ts
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

export type ThemeTokens = typeof lightTokens;
```

Also add a tiny helper the CSS generator reuses:

```ts
// Code/shared/theme/emit-css.ts  — turns a token map into CSS custom-property lines
import { lightTokens, darkTokens } from "./tokens";
import { brand } from "./brand";

const toVars = (t: Record<string, string>) =>
  Object.entries(t).map(([k, v]) => `  --${k}: ${v};`).join("\n");

export function themeCss(): string {
  return `:root {
${toVars(lightTokens)}
  --radius: ${brand.radius};
  color-scheme: light;
}
.dark {
${toVars(darkTokens)}
  color-scheme: dark;
}
`;
}
```

### 3. [shared] Confirm the consumption mechanism from script 01
Both clients must resolve `@shared/theme/*`. Verify the mechanism chosen in `01` Task 3 works for **both** apps:
- **Preferred:** `tsconfig.json` path alias `"@shared/*": ["../../shared/*"]` **plus** `transpilePackages` (or the Next 16 equivalent from the docs) in each `next.config.ts`, so files outside the app root compile. Since both clients already set `reactCompiler: true`, keep that and add the theme wiring alongside it.
- **Fallback (if cross-root imports fight the bundler):** a `sync-theme` npm script per client that copies `shared/theme/*` into `src/theme/generated/` and imports from there. Whichever is used, the rule holds: **editing `shared/theme/brand.ts` is the only source edit for a re-brand.**

### 4. [both clients] Emit CSS variables from the shared tokens
Do this identically in `user_client` and `admin_client`. Prefer **generating** the CSS so it cannot drift from `brand.ts`:
- Add `scripts/gen-theme-css.ts` (run via `tsx`) that imports `themeCss()` from `@shared/theme/emit-css` and writes `src/theme/theme.generated.css`.
- Wire it into `package.json` as `"gen:theme": "tsx scripts/gen-theme-css.ts"` and prepend it to `predev`/`prebuild` (e.g. `"predev": "npm run gen:theme"`) so every dev/build run regenerates.
- In `src/app/globals.css` import the generated file and, because Tailwind v4 is CSS-first and `next-themes` uses a **class** attribute, register the dark variant and map every token to a Tailwind color utility:

```css
/* src/app/globals.css */
@import "tailwindcss";
@import "../theme/theme.generated.css";   /* emits :root (light) + .dark (dark) */

/* next-themes toggles the .dark class on <html>; wire Tailwind's dark: to it */
@custom-variant dark (&:where(.dark, .dark *));

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-success: hsl(var(--success));
  --color-success-foreground: hsl(var(--success-foreground));
  --color-warning: hsl(var(--warning));
  --color-warning-foreground: hsl(var(--warning-foreground));

  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);

  --font-heading: var(--font-heading);
  --font-body: var(--font-body);
}
```
Remove the scaffold's default `--background/--foreground` and hardcoded `body { font-family: Arial }` so nothing overrides the tokens. (If the `sync-theme` fallback is used, import `src/theme/generated/theme.css` instead.)

### 5. [both clients] Fonts from the brand file
In each client's root `src/app/layout.tsx`, load fonts via `next/font/google` driven by `brand.fonts` (heading + body), exposed as CSS vars `--font-heading` / `--font-body`, and set them on `<html>`/`<body>`. **Consult `node_modules/next/dist/docs/` for the exact `next/font` API in Next 16** before writing. Changing `brand.fonts` must swap typography in both apps. (Fonts must be referenced statically for `next/font` — if the font name can't be dynamic, read it from `brand.fonts` in a small mapping and document that adding a brand-new font family is the one case needing a one-line import change.)

### 6. [both clients] ThemeProvider (next-themes)
- `src/theme/ThemeProvider.tsx` — a Client Component wrapping `next-themes`' provider with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`.
- Add it high in `src/app/layout.tsx` (wrapping `children`, alongside the QueryClient provider from `01`). Add `suppressHydrationWarning` on `<html>` per next-themes guidance to avoid the class-swap hydration warning.
- next-themes injects a pre-hydration script that sets the class before paint — this prevents the flash of wrong theme. Verify no flash on reload.

### 7. [both clients] ThemeToggle component
- `src/components/shared/ThemeToggle.tsx` — accessible Client Component cycling Light / Dark / System via `useTheme()`, sun/moon/monitor icons (`lucide-react`), `aria-label`, keyboard-operable.
- Guard against hydration mismatch with a `mounted` flag (render a neutral placeholder until mounted).
- Place it in the storefront header (user_client) and the admin topbar (admin_client). The admin shell built in script `05` reuses this same component.

### 8. [both clients] Theme preview QA page — `/theme-preview`
Add `src/app/theme-preview/page.tsx` in **each** client: swatches for every semantic token (bg/fg pairs), plus sample buttons, cards, inputs, badges (primary/secondary/muted/accent/destructive/success/warning) rendered in both modes with the `ThemeToggle` present. Use it to verify the toggle, no-flash, and contrast. Keep it dev-only (or delete after the UI scripts `14`/`15`).

### 9. Note for later — emails (script 16)
The Resend + React-Email templates in script `16` import `brand` (and optionally `lightTokens`) from `@shared/theme` on the **backend** so transactional emails match the store palette/fonts. Do not build the templates here — just keep `shared/theme` free of any React/Next/DOM imports so the backend can import it cleanly.

---

## Re-branding instructions (also placed as the comment header of `brand.ts`)
> To re-theme the entire platform: edit `palette`, `fonts`, and `radius` in **`Code/shared/theme/brand.ts`** only, then run `npm run gen:theme` in each client (automatic on `predev`/`prebuild`). Both the storefront and the admin panel — and later the emails — update. No other file changes.

## Acceptance criteria
- [ ] Changing one color in `Code/shared/theme/brand.ts` (then `npm run gen:theme`) visibly re-themes **both** `user_client` and `admin_client` — verified on each `/theme-preview` — with no other source edits.
- [ ] Dark/light toggle works in **both** clients; system preference respected; no flash of wrong theme on reload.
- [ ] Tokens live in `shared/theme` only; no component in either client hardcodes a hex or font family; all use semantic Tailwind utilities.
- [ ] Fonts come from `brand.fonts` via `next/font` in each client; changing them swaps typography in both apps.
- [ ] `shared/theme` has no React/Next/DOM imports (backend-importable for script `16` emails).
- [ ] Body-text contrast ≥ 4.5:1 in light and dark (spot-check on both preview pages).
- [ ] `npm run build` passes in both clients.
