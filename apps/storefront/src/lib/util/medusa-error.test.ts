import { FetchError } from "@medusajs/js-sdk"
import { describe, expect, it } from "vitest"
import medusaError from "./medusa-error"

describe("medusaError", () => {
  it("passes on the backend message of a refused SDK request", () => {
    const refused = new FetchError(
      "Cart is pending approval",
      "Bad Request",
      400
    )

    expect(() => medusaError(refused)).toThrowError(
      new Error("Cart is pending approval")
    )
  })

  it("reports a request that failed before a response", () => {
    expect(() => medusaError(new TypeError("fetch failed"))).toThrowError(
      new Error("Error setting up the request: fetch failed")
    )
  })
})
