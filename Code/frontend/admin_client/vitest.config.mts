import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest + React Testing Library setup, verified against the Next 16 testing
 * guide (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`).
 *
 * Next 16 note: Vitest cannot render `async` Server Components — those are
 * covered by the Playwright E2E suite (script 18, Task 6). These specs target
 * pure utils/schemas and SYNCHRONOUS client components only.
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
      include: [
        "src/lib/utils.ts",
        "src/lib/format.ts",
        "src/lib/slug.ts",
        "src/lib/validation/**",
        "src/components/ui/StatusBadge.tsx",
        "src/components/ui/Pagination.tsx",
        "src/components/orders/OrderStatusBadge.tsx",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 55,
        // Money/slug helpers are business-critical → held higher.
        "src/lib/format.ts": {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 70,
        },
        "src/lib/slug.ts": {
          lines: 90,
          functions: 100,
          statements: 90,
          branches: 60,
        },
      },
    },
  },
});
