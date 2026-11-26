import { sdk } from "@/lib/config"
import { addToCart, addToCartBulk } from "@/lib/data/cart"
import { getRegion } from "@/lib/data/regions"
import { addLineItemsBulk } from "@/lib/util/server-cart"
import { FetchError } from "@medusajs/js-sdk"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/config", () => ({
  sdk: {
    client: { fetch: vi.fn() },
    store: { cart: { createLineItem: vi.fn() } },
  },
}))
vi.mock("@/lib/util/server-cart", () => ({ addLineItemsBulk: vi.fn() }))
vi.mock("@/lib/data/cookies", () => ({
  getAuthHeaders: vi.fn(async () => ({})),
  getCacheOptions: vi.fn(async () => ({})),
  getCacheTag: vi.fn(async () => "carts-tag"),
  getCartId: vi.fn(async () => "cart_1"),
  removeCartId: vi.fn(),
  setCartId: vi.fn(),
}))
vi.mock("@/lib/data/customer", () => ({ retrieveCustomer: vi.fn() }))
vi.mock("@/lib/data/regions", () => ({ getRegion: vi.fn() }))
vi.mock("@vercel/analytics/server", () => ({ track: vi.fn() }))
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

// The backend refuses items for a cart that waits for approval with this
// response (apps/backend/src/workflows/hooks/validate-add-to-cart.ts).
const pendingApproval = () =>
  new FetchError("Cart is pending approval", "Bad Request", 400)

const addOne = () =>
  addToCart({ variantId: "variant_1", quantity: 1, countryCode: "dk" })
const addBulk = () =>
  addToCartBulk({
    lineItems: [
      { variant_id: "variant_1", quantity: 1 },
      { variant_id: "variant_2", quantity: 2 },
    ],
    countryCode: "dk",
  })

const actions = [
  {
    name: "addToCart",
    add: addOne,
    request: () => vi.mocked(sdk.store.cart.createLineItem),
  },
  {
    name: "addToCartBulk",
    add: addBulk,
    request: () => vi.mocked(addLineItemsBulk),
  },
]

beforeEach(() => {
  vi.mocked(getRegion).mockResolvedValue({ id: "reg_1" } as never)
  vi.mocked(sdk.client.fetch).mockResolvedValue({
    cart: { id: "cart_1", region_id: "reg_1" },
  } as never)
})

describe.each(actions)("$name", ({ add, request }) => {
  it("returns the pending approval rejection instead of throwing it", async () => {
    request().mockRejectedValue(pendingApproval())

    await expect(add()).resolves.toEqual({
      error: {
        code: "cart_pending_approval",
        message: "Cart is pending approval",
      },
    })
  })

  it("returns no error when the backend accepts the items", async () => {
    request().mockResolvedValue({} as never)

    await expect(add()).resolves.toEqual({})
  })

  it("throws any other refusal", async () => {
    request().mockRejectedValue(
      new FetchError("Variant is out of stock", "Bad Request", 400)
    )

    await expect(add()).rejects.toThrowError("Variant is out of stock")
  })
})
