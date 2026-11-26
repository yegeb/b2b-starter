import { expect, Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { openPage, required, storefrontUrl } from "./storefront"

export { openPage, storefrontUrl }

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

export const fixtures = JSON.parse(
  readFileSync(required("E2E_FIXTURES"), "utf8")
) as Fixtures
export const backendUrl = required("E2E_BACKEND_URL")

// Approval cards label a cart with the last four characters of its ID.
export const cartLabel = (cartId: string) => `#${cartId.slice(-4)}`

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

export const submitAdminLogin = async (
  page: Page,
  { email, password }: { email: string; password: string }
) => {
  await page.getByRole("textbox", { name: "Email" }).fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole("button", { name: "Continue with Email" }).click()
}

export const signInToAdmin = async (page: Page) => {
  await openPage(page, `${backendUrl}/app/login`)
  await submitAdminLogin(page, fixtures.admin)
  await page.waitForURL((url) => !url.pathname.endsWith("/login"))
}
