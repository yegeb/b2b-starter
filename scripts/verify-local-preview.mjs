// Check the seeded local container preview in a browser.
//
// The script runs the catalog test from apps/e2e/tests/catalog.spec.ts against
// the preview storefront. The test checks that the store lists the eight seeded
// products and that the Laptops filter narrows the list to the laptop. The pull
// request checks run the same test against the browser test storefront.
//
// Install the dependencies and the Playwright browser first:
//   pnpm install --frozen-lockfile
//   pnpm --filter @b2b-starter/e2e exec playwright install chromium
// Set PREVIEW_URL if the storefront does not use http://localhost:18000.

import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repoDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const storefront = (process.env.PREVIEW_URL || "http://localhost:18000").replace(
  /\/+$/,
  ""
)

console.log(`Checking the seeded catalog at ${storefront}`)

const child = spawn(
  "pnpm",
  [
    "--filter",
    "@b2b-starter/e2e",
    "exec",
    "playwright",
    "test",
    "tests/catalog.spec.ts",
    "--reporter=list",
  ],
  {
    cwd: repoDir,
    stdio: "inherit",
    env: { ...process.env, E2E_STOREFRONT_URL: storefront },
  }
)

child.on("error", (error) => {
  console.error(`Could not run the catalog test: ${error.message}`)
  process.exitCode = 1
})
child.on("exit", (code, signal) => {
  if (code === 0) {
    console.log(
      "Local preview browser check passed: the seeded catalog and the laptop filter work."
    )
    return
  }
  console.error(
    `Local preview browser check failed (${signal ?? `exit code ${code}`}).`
  )
  process.exitCode = code || 1
})
