// Generates src/theme/generated/theme.css from this client's OWN brand tokens
// in src/theme/. Run via tsx on predev/prebuild (`npm run gen:theme`). The
// browser only ever loads the generated CSS, so it cannot drift from the
// tokens it was emitted from. This is a build tool and is not bundled by Next,
// so it imports the TypeScript source directly.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { themeCss } from "../src/theme/emit-css";

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, "../src/theme/generated/theme.css");

mkdirSync(dirname(outFile), { recursive: true });
// The storefront ships ONE palette — pitch black and gold. See
// ThemeCssOptions.singleMode in src/theme/emit-css.ts for why.
writeFileSync(outFile, themeCss({ singleMode: "dark" }), "utf8");
console.log(`[gen-theme-css] wrote ${outFile}`);
