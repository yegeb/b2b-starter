import { expect, Page } from "@playwright/test"
import { readFileSync } from "node:fs"

type Credentials = { email: string; password: string; customerId: string }

export type Fixtures = {
  admin: { email: string; password: string }
  companyA: { id: string; name: string }
  buyer: Credentials
  colleague: Credentials
  approver: Credentials
  otherBuyer: Credentials
  carts: { buyer: string; colleague: string; otherCompany: string }
  quote: { id: string; draftOrderId: string }
}

const required = (name: string) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set. Run the tests with pnpm test:e2e.`)
  }
  return value
}

export const fixtures = JSON.parse(
  readFileSync(required("E2E_FIXTURES"), "utf8")
) as Fixtures
export const storefrontUrl = required("E2E_STOREFRONT_URL")
export const backendUrl = required("E2E_BACKEND_URL")

// Approval cards label a cart with the last four characters of its ID.
export const cartLabel = (cartId: string) => `#${cartId.slice(-4)}`

export const openPage = async (page: Page, url: string) => {
  const response = await page.goto(url)
  expect(response?.status(), `status of ${url}`).toBeLessThan(400)
}

export const signInToStorefront = async (
  page: Page,
  { email, password }: Credentials
) => {
  await openPage(page, `${storefrontUrl}/dk/account`)
  await page.getByTestId("email-input").fill(email)
  await page.getByTestId("password-input").fill(password)
  await page.getByTestId("sign-in-button").click()
  await expect(page.getByText(email)).toBeVisible()
}

export const signInToAdmin = async (page: Page) => {
  await openPage(page, `${backendUrl}/app/login`)
  await page.getByRole("textbox", { name: "Email" }).fill(fixtures.admin.email)
  await page.locator('input[type="password"]').fill(fixtures.admin.password)
  await page.getByRole("button", { name: "Continue with Email" }).click()
  await page.waitForURL((url) => !url.pathname.endsWith("/login"))
}
