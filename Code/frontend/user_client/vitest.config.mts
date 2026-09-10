import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest + React Testing Library setup, verified against the Next 16 testing
 * guide (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`).
 *
 * Next 16 note: Vitest cannot render `async` Server Components — those are
 * covered by the Playwright E2E suite (script 18, Task 6). These specs therefore
 * target pure utils/schemas/stores and SYNCHRONOUS client components only.
 *
 * `vite-tsconfig-paths` mirrors the `@/*` alias from tsconfig so imports resolve
 * exactly as they do in the app.
 */
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Scope coverage to the business-logic units + components under test so the
      // gate is meaningful (NFR-604). Broadens as more specs land.
      include: [
        "src/lib/utils.ts",
        "src/lib/utils/money.ts",
        "src/lib/store/cart-store.ts",
        "src/lib/validation/auth.ts",
        "src/components/reviews/StarRating.tsx",
        "src/components/storefront/QuantityStepper.tsx",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 55,
        // Money/format helpers are business-critical → held higher.
        "src/lib/utils/money.ts": {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 70,
        },
      },
    },
  },
});
