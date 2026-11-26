import { expect, Locator, Page, test } from "@playwright/test"
import {
  fixtures,
  openPage,
  serverBackendRequests,
  signInToStorefront,
  storefrontUrl,
} from "./fixtures"

const { buyer, carts, laptop, shopper } = fixtures
const quantities = new Map([
  ["256 GB / Blue", 2],
  ["512 GB / Red", 3],
])

const openLaptopPage = async (page: Page) => {
  await openPage(page, `${storefrontUrl}/dk/products/${laptop.handle}`)
  // The button is enabled before hydration so that the form also works
  // without JavaScript. Wait for the client handler that calls addToCartBulk.
  const addToCart = page.getByTestId("add-product-button")
  await expect(addToCart).toHaveText("Choose product variant(s) above")
  await expect(addToCart).toBeDisabled()
  return addToCart
}

const quantityInput = (scope: Page | Locator, variant: string) =>
  scope.getByRole("spinbutton", { name: `Quantity for ${variant}` })

test("a bulk add of two laptop variants persists in the cart through the server-side backend URL", async ({
  page,
}) => {
  expect(laptop.variants.map(({ title }) => title).sort()).toEqual(
    [...quantities.keys()].sort()
  )

  await signInToStorefront(page, shopper)
  const addToCart = await openLaptopPage(page)

  for (const [variant, quantity] of quantities) {
    await quantityInput(page, variant).fill(String(quantity))
  }
  await expect(addToCart).toHaveText("Add to cart")
  await addToCart.click()

  const cartId = async () =>
    (await page.context().cookies()).find(
      ({ name }) => name === "_medusa_cart_id"
    )?.value
  await expect.poll(cartId).toBeTruthy()
  const cartPath = `/store/carts/${await cartId()}`
  const bulkAdd = `${cartPath}/line-items/bulk`
  await expect
    .poll(() =>
      serverBackendRequests().some(
        ({ method, path }) => method === "POST" && path === bulkAdd
      )
    )
    .toBe(true)
  await expect(page.getByText("Failed to add to cart")).toHaveCount(0)

  await openPage(page, `${storefrontUrl}/dk/cart`)
  const expectCartContents = async () => {
    const items = page.getByTestId("cart-item")
    await expect(items).toHaveCount(quantities.size)
    for (const [variant, quantity] of quantities) {
      const item = items.filter({ hasText: variant })
      await expect(item).toContainText(laptop.title)
      await expect(quantityInput(item, variant)).toHaveValue(String(quantity))
    }
    await expect(page.getByText("Total: 5 items")).toBeVisible()
  }
  await expectCartContents()

  await page.reload()
  await expectCartContents()

  // The storefront server sent its backend requests to the server-side URL,
  // and no browser request reached that URL.
  const requests = serverBackendRequests()
  expect(
    requests.some(
      ({ method, path }) => method === "GET" && path.startsWith(`${cartPath}?`)
    )
  ).toBe(true)
  expect(requests.filter(({ origin }) => origin !== null)).toEqual([])
})

test("a bulk add that the backend refuses shows an error and leaves the cart unchanged", async ({
  page,
}) => {
  // The buyer's fixture cart waits for approval, so the backend refuses new items.
  await signInToStorefront(page, buyer)
  await page
    .context()
    .addCookies([
      { name: "_medusa_cart_id", value: carts.buyer, url: storefrontUrl },
    ])

  const addToCart = await openLaptopPage(page)
  await quantityInput(page, "256 GB / Blue").fill("1")
  await addToCart.click()

  await expect(page.getByText("Failed to add to cart")).toBeVisible()

  await openPage(page, `${storefrontUrl}/dk/cart`)
  const items = page.getByTestId("cart-item")
  await expect(items).toHaveCount(1)
  await expect(items).not.toContainText(laptop.title)
  await expect(page.getByText("Total: 1 items")).toBeVisible()
})
