import { expect, test } from "./test"
import { openPage, storefrontUrl } from "./storefront"

// This test needs only a storefront with the initial seed, so
// scripts/verify-local-preview.mjs also runs it against the local container
// preview.

const laptop = "Ultra-Slim AI Laptop"

test("the seeded catalog lists eight products and the laptop filter narrows it to the laptop", async ({
  page,
}) => {
  await openPage(page, `${storefrontUrl}/dk/store`)

  const count = page.getByTestId("product-count")
  const titles = page.getByTestId("products-list").getByTestId("product-title")
  await expect(count).toHaveText("8 products")
  await expect(titles).toHaveCount(8)
  await expect(titles.filter({ hasText: laptop })).toHaveCount(1)

  const laptops = page.getByTestId("facet-category-Laptops")
  await laptops.click()

  await expect(laptops).toHaveAttribute("aria-checked", "true")
  await expect(count).toHaveText("1 product")
  await expect(titles).toHaveCount(1)
  await expect(titles).toContainText(laptop)
  await expect(page.getByText("Couldn't load products")).toHaveCount(0)
})
