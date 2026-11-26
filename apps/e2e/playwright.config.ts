import { defineConfig, devices } from "@playwright/test"

// Start the servers and fixtures with `pnpm test:e2e` (scripts/run-e2e.mjs).
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  // Development servers compile each page on its first request.
  timeout: 240_000,
  expect: { timeout: 60_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    navigationTimeout: 180_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
})
