import { expect, test } from "./test"
import {
  cartLabel,
  fixtures,
  openPage,
  signInToStorefront,
  storefrontUrl,
} from "./fixtures"

const { buyer, approver, carts } = fixtures
const notAvailable = "Only company admins can review approval requests."

test("an ordinary employee's account shows only their own approval requests", async ({
  page,
}) => {
  await signInToStorefront(page, buyer)

  await expect(page.getByTestId("approvals-link")).toHaveCount(0)

  await openPage(page, `${storefrontUrl}/dk/account/orders`)
  await expect(
    page.getByRole("heading", { name: "Pending Approvals" })
  ).toBeVisible()
  await expect(page.getByText(cartLabel(carts.buyer))).toBeVisible()
  await expect(page.getByText(cartLabel(carts.colleague))).toHaveCount(0)
  await expect(page.getByText(cartLabel(carts.otherCompany))).toHaveCount(0)

  await openPage(page, `${storefrontUrl}/dk/account/approvals`)
  await expect(page.getByText(notAvailable)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Pending" })).toHaveCount(0)
})

test("a company admin sees the company's pending approval requests", async ({
  page,
}) => {
  await signInToStorefront(page, approver)

  await expect(
    page.getByTestId("account-nav").getByTestId("approvals-link")
  ).toContainText("2")

  await openPage(page, `${storefrontUrl}/dk/account/approvals`)
  await expect(page.getByRole("heading", { name: "Pending" })).toBeVisible()
  await expect(page.getByText(cartLabel(carts.buyer))).toBeVisible()
  await expect(page.getByText(cartLabel(carts.colleague))).toBeVisible()
  await expect(page.getByText(cartLabel(carts.otherCompany))).toHaveCount(0)
  await expect(page.getByText(notAvailable)).toHaveCount(0)

  await openPage(page, `${storefrontUrl}/dk/account/orders`)
  await expect(
    page.getByRole("heading", { name: "Pending Approvals" })
  ).toBeVisible()
  await expect(page.getByText(cartLabel(carts.buyer))).toBeVisible()
  await expect(page.getByText(cartLabel(carts.colleague))).toBeVisible()
})
