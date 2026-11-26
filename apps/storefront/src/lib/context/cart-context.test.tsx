import { addToCartBulk } from "@/lib/data/cart"
import {
  addToCartEventBus,
  type AddToCartEventPayload,
} from "@/lib/data/cart-event-bus"
import { CartProvider } from "@/lib/context/cart-context"
import { B2BCart } from "@/types/global"
import { toast } from "@medusajs/ui"
import { render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/data/cart", () => ({
  addToCartBulk: vi.fn(),
  deleteLineItem: vi.fn(),
  emptyCart: vi.fn(),
  updateLineItem: vi.fn(),
}))
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }))
vi.mock("@medusajs/ui", () => ({ toast: { error: vi.fn() } }))
vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "dk" }),
}))

const payload = {
  regionId: "reg_1",
  lineItems: [
    {
      productVariant: {
        id: "variant_1",
        title: "256 GB / Blue",
        product: { id: "prod_1", title: "Laptop" },
        calculated_price: { calculated_amount: 100 },
      },
      quantity: 2,
    },
  ],
} as unknown as AddToCartEventPayload

const cart = { id: "cart_1", items: [], approvals: [] } as unknown as B2BCart

const addToCartWith = async (onCartUpdated = vi.fn(async () => {})) => {
  render(
    <CartProvider cart={cart} onCartUpdated={onCartUpdated}>
      <div />
    </CartProvider>
  )
  addToCartEventBus.emitCartAdd(payload)
  await waitFor(() => expect(addToCartBulk).toHaveBeenCalled())
  return onCartUpdated
}

describe("CartProvider bulk add", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockImplementation(() => "")
  })

  it("blocks an add once a cart waiting for approval arrives after the first render", async () => {
    vi.mocked(addToCartBulk).mockClear()
    vi.mocked(toast.error).mockClear()
    const pendingCart = {
      ...cart,
      approvals: [{ id: "appr_1", status: "pending" }],
    } as unknown as B2BCart

    // Statically rendered pages load the session cart in the browser, so the
    // provider first renders without a cart.
    const { rerender } = render(
      <CartProvider cart={null}>
        <div />
      </CartProvider>
    )
    rerender(
      <CartProvider cart={pendingCart}>
        <div />
      </CartProvider>
    )

    addToCartEventBus.emitCartAdd(payload)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Cart is locked for approval.")
    )
    expect(addToCartBulk).not.toHaveBeenCalled()
  })

  it("tells the buyer that a cart waiting for approval is locked", async () => {
    vi.mocked(addToCartBulk).mockResolvedValue({
      error: {
        code: "cart_pending_approval",
        message: "Cart is pending approval",
      },
    })

    const onCartUpdated = await addToCartWith()

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Cart is locked for approval.")
    )
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(onCartUpdated).not.toHaveBeenCalled()
  })

  it("reports any other failure as a failed add", async () => {
    vi.mocked(addToCartBulk).mockRejectedValue(
      new Error("An error occurred in the Server Components render.")
    )

    await addToCartWith()

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to add to cart")
    )
  })

  it("refreshes the cart after a successful add", async () => {
    vi.mocked(addToCartBulk).mockResolvedValue({})

    const onCartUpdated = await addToCartWith()

    await waitFor(() => expect(onCartUpdated).toHaveBeenCalled())
    expect(toast.error).not.toHaveBeenCalled()
  })
})
