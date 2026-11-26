import { expect, test } from "./test"
import { backendUrl, fixtures, openPage, signInToAdmin } from "./fixtures"

const { buyer, companyA, quote } = fixtures

test.beforeEach(async ({ page }) => {
  await signInToAdmin(page)
})

test("quote details show the buyer's spending limit and company", async ({
  page,
}) => {
  await openPage(page, `${backendUrl}/app/quotes/${quote.id}`)

  await expect(page.getByRole("link", { name: buyer.email })).toBeVisible()
  // Company A uses USD; the quote's draft order uses EUR.
  await expect(page.getByText("Spending Limit").locator("..")).toContainText(
    "$1,000.00"
  )
  await expect(page.getByRole("link", { name: companyA.name })).toHaveAttribute(
    "href",
    `/app/companies/${companyA.id}`
  )
  await expect(page.getByText("NaN")).toHaveCount(0)
})

test("an edit of a grouped quote price keeps the edited value", async ({
  page,
}) => {
  await openPage(page, `${backendUrl}/app/quotes/${quote.id}/manage`)

  const dialog = page.getByRole("dialog")
  await dialog.locator('button[aria-haspopup="menu"]').first().click()
  await page.getByRole("menuitem", { name: "Update Price" }).click()

  const price = dialog.getByRole("textbox")
  await price.fill("1500")
  await price.press("Tab")
  await expect(price).toHaveValue("1,500")
  await expect(dialog.getByText("€1,500.00").first()).toBeVisible()

  await price.click()
  await price.press("End")
  await price.press("Backspace")
  await price.press("Tab")
  await expect(price).toHaveValue("150")
  await expect(dialog.getByText("€150.00").first()).toBeVisible()
  await expect(dialog.getByText("NaN")).toHaveCount(0)
})
