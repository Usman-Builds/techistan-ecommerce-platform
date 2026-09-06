// ─────────────────────────────────────────────────────────────────────────────
// gen:brand — copy the shared brand tokens into the backend source tree.
//
// The dist entry is `dist/src/main.js`, which requires every compiled input to
// live under `src/`. Importing `../../shared/theme/brand.ts` directly would move
// the computed rootDir up to `Code/` and relocate the entry — so instead we copy
// the (import-free) brand token file into `src/shared/brand.generated.ts` before
// every build/start. This mirrors how each Next client runs `gen:theme` on
// predev/prebuild: a single edit to `Code/shared/theme/brand.ts` re-themes the
// transactional emails AND both storefronts (satisfies 00 §5).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../shared/theme/brand.ts');
const outDir = resolve(here, '../src/shared');
const outFile = resolve(outDir, 'brand.generated.ts');

const banner = `// ⚠️  GENERATED FILE — DO NOT EDIT.
// Produced by scripts/gen-brand.mjs from Code/shared/theme/brand.ts on prebuild/
// prestart. Edit the shared source, not this copy.

`;

const body = readFileSync(source, 'utf8');
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, banner + body, 'utf8');
console.log('[gen:brand] wrote', outFile);
