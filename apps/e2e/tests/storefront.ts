import { expect, Page } from "@playwright/test"

// Helpers for tests that need only a running storefront. The catalog test
// also runs against the local container preview, which has no e2e fixtures.

export const required = (name: string) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set. Run the tests with pnpm test:e2e.`)
  }
  return value
}

export const storefrontUrl = required("E2E_STOREFRONT_URL")

export const openPage = async (page: Page, url: string) => {
  const response = await page.goto(url)
  expect(response?.status(), `status of ${url}`).toBeLessThan(400)
}
