import { defineConfig, devices } from "@playwright/test";

/**
 * Cross-app E2E (script 18, Task 6, SRD §11). These journeys span all THREE apps
 * — the NestJS backend (:3000), this storefront (:3001), and the admin client
 * (:3002) — against a seeded test DB and Stripe TEST mode. The suite lives here
 * in user_client because every journey starts on the storefront.
 *
 * One-command local run (see e2e/README.md for prerequisites + env):
 *   npm run e2e
 *
 * `webServer` boots all three servers and waits for each to be reachable before
 * the run. Set `E2E_NO_SERVER=1` to test against already-running servers.
 *
 * Next 16 note: async Server Components can't be unit-tested (Vitest) — the SSR
 * product/category pages are therefore validated HERE, in a real browser.
 */
const BACKEND = "http://localhost:3000";
const STOREFRONT = "http://localhost:3001";
const ADMIN = "http://localhost:3002";

const backendEnv = {
  NODE_ENV: "test",
  // A dedicated E2E database, seeded by e2e/global-setup.ts. Keep it separate
  // from the integration DB so the two suites never race.
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ??
    "postgresql://postgres:260603@localhost/ecom_e2e?schema=public",
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Visual snapshots live next to their spec as <name>-snapshots/.
  snapshotPathTemplate: "{testDir}/__snapshots__/{testFilePath}/{arg}{ext}",
  fullyParallel: false, // journeys mutate shared catalog/order state
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // Allow tiny anti-aliasing diffs in visual regression before failing.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: STOREFRONT,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
  ],
  // Skip webServer when E2E_NO_SERVER=1 (servers already up).
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : [
        {
          command: "npm run start:prod",
          cwd: "../../backend",
          url: `${BACKEND}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: backendEnv,
        },
        {
          command: "npm run start",
          url: STOREFRONT,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: "npm run start",
          cwd: "../admin_client",
          url: ADMIN,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
