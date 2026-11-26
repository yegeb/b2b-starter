import { addToCartBulk, deleteLineItem } from "@/lib/data/cart"
import {
  addToCartEventBus,
  type AddToCartEventPayload,
} from "@/lib/data/cart-event-bus"
import { CartProvider, useCart } from "@/lib/context/cart-context"
import CartTotals from "@/modules/cart/components/cart-totals"
import { B2BCart } from "@/types/global"
import { toast } from "@medusajs/ui"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/data/cart", () => ({
  addToCartBulk: vi.fn(),
  deleteLineItem: vi.fn(),
  emptyCart: vi.fn(),
  updateLineItem: vi.fn(),
}))
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }))
vi.mock("@medusajs/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@medusajs/ui")>()),
  toast: { error: vi.fn() },
}))
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
  it.each([
    [
      "the backend refuses it for a pending approval",
      () =>
        vi.mocked(addToCartBulk).mockResolvedValue({
          error: {
            code: "cart_pending_approval",
            message: "Cart is pending approval",
          },
        }),
    ],
    [
      "the request fails",
      () => vi.mocked(addToCartBulk).mockRejectedValue(new Error("Failed")),
    ],
  ])(
    "shows the cart totals again after a refused add when %s",
    async (_, refuse) => {
      vi.mocked(addToCartBulk).mockReset()
      vi.mocked(toast.error).mockClear()
      refuse()
      const cartWithTotals = {
        ...cart,
        currency_code: "eur",
        total: 1000,
        item_subtotal: 1000,
        tax_total: 0,
        shipping_total: 0,
        discount_total: 0,
        gift_card_total: 0,
      } as unknown as B2BCart

      render(
        <CartProvider cart={cartWithTotals}>
          <CartTotals />
        </CartProvider>
      )
      expect(screen.getByTestId("cart-total")).toBeTruthy()

      addToCartEventBus.emitCartAdd(payload)

      await waitFor(() => expect(addToCartBulk).toHaveBeenCalled())
      await waitFor(() => expect(toast.error).toHaveBeenCalled())
      // The skeleton replaces the total while the cart updates. A refusal
      // leaves the cart prop unchanged, so the provider must clear it itself.
      await waitFor(() => expect(screen.getByTestId("cart-total")).toBeTruthy())
    }
  )

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

describe("CartProvider item changes", () => {
  const DeleteFirstItem = () => {
    const { cart, handleDeleteItem } = useCart()
    return (
      <button onClick={() => handleDeleteItem(cart!.items![0].id)}>
        Delete
      </button>
    )
  }

  it("shows the cart totals again after a refused delete", async () => {
    vi.mocked(toast.error).mockClear()
    vi.mocked(deleteLineItem).mockRejectedValue(new Error("Failed"))
    const cartWithItem = {
      ...cart,
      currency_code: "eur",
      total: 1000,
      items: [{ id: "item_1", quantity: 1, unit_price: 1000 }],
    } as unknown as B2BCart

    render(
      <CartProvider cart={cartWithItem}>
        <CartTotals />
        <DeleteFirstItem />
      </CartProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to delete item")
    )
    await waitFor(() => expect(screen.getByTestId("cart-total")).toBeTruthy())
  })
})
