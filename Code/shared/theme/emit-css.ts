// ─────────────────────────────────────────────────────────────────────────────
// Turns the shared token maps into the CSS custom-property blocks that both
// clients emit. Called by each client's `scripts/gen-theme-css.ts` at
// predev/prebuild — the generated CSS is what the browser actually loads, so it
// can never drift from brand.ts/tokens.ts.
//
// Framework-agnostic — no React / Next / DOM imports.
// ─────────────────────────────────────────────────────────────────────────────
import { lightTokens, darkTokens } from "./tokens";
import { brand } from "./brand";

const toVars = (t: Record<string, string>) =>
  Object.entries(t)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join("\n");

const HEADER = `/* AUTO-GENERATED from Code/shared/theme — do not edit by hand.
 * Regenerate with \`npm run gen:theme\` (runs on predev/prebuild).
 * Re-brand by editing Code/shared/theme/brand.ts only. */`;

export interface ThemeCssOptions {
  /**
   * Emit ONE palette on `:root` instead of a light/dark pair.
   *
   * The storefront is single-mode by design — it is a black-and-gold product
   * page, not an app someone lives in all day, and a shopper toggling it to
   * light is a shopper seeing a different brand. Emitting only the one palette
   * means there is no second theme to keep in sync, no `.dark` class to depend
   * on, and no window in which the wrong palette can paint.
   *
   * The admin keeps both: it IS an app someone lives in all day, and that is a
   * real accessibility and daylight-legibility argument rather than a
   * branding one.
   */
  singleMode?: "light" | "dark";
}

/** The generated stylesheet: `:root` + `.dark`, or a single `:root` palette. */
export function themeCss(options: ThemeCssOptions = {}): string {
  const radius = `  --radius: ${brand.radius};`;

  if (options.singleMode) {
    const single = options.singleMode === "dark" ? darkTokens : lightTokens;
    return `${HEADER}
/* SINGLE-MODE build (${options.singleMode}). There is no \`.dark\` block and no
 * theme switching on this client — see ThemeCssOptions.singleMode. Do not add
 * \`dark:\` utilities here; they would never match. */
:root {
${toVars(single)}
${radius}
  color-scheme: ${options.singleMode};
}
`;
  }

  return `${HEADER}
:root {
${toVars(lightTokens)}
${radius}
  color-scheme: light;
}

.dark {
${toVars(darkTokens)}
  color-scheme: dark;
}
`;
}
