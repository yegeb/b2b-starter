import { updateCompany } from "@/lib/data/companies"
import CompanyCard from "@/modules/account/components/company-card"
import { QueryCompany } from "@/types"
import { toast } from "@medusajs/ui"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/data/companies", () => ({ updateCompany: vi.fn() }))

vi.mock("@medusajs/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@medusajs/ui")>()),
  toast: { success: vi.fn(), error: vi.fn() },
}))

// The Store API returns these read-only fields with the company.
const company = {
  id: "comp_a",
  name: "Company A",
  email: "a@company-a.test",
  phone: "1234567890",
  address: "1 Main St",
  city: "Copenhagen",
  state: "Capital",
  zip: "1000",
  country: "dk",
  logo_url: null,
  currency_code: "eur",
  spending_limit_reset_frequency: "monthly",
  created_at: "2026-11-26T00:00:00.000Z",
  updated_at: "2026-11-26T00:00:00.000Z",
  employees: [{ id: "emp_admin" }],
  approval_settings: { id: "apprset_a", requires_admin_approval: false },
} as unknown as QueryCompany

const saveCompany = async () => {
  render(<CompanyCard company={company} regions={[]} />)

  fireEvent.click(screen.getByRole("button", { name: "Edit" }))
  fireEvent.click(screen.getByRole("button", { name: "Save" }))

  await waitFor(() => expect(updateCompany).toHaveBeenCalledTimes(1))
}

describe("CompanyCard", () => {
  beforeEach(() => {
    vi.mocked(updateCompany).mockResolvedValue({
      company,
    } as Awaited<ReturnType<typeof updateCompany>>)
  })

  it("shows only the error toast when the update fails", async () => {
    vi.mocked(updateCompany).mockRejectedValue(new Error("Bad request"))

    await saveCompany()

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Error updating company")
    )
    expect(toast.success).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
  })

  it("shows the success toast when the update succeeds", async () => {
    await saveCompany()

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Company updated")
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("sends only the editable company fields", async () => {
    await saveCompany()

    expect(updateCompany).toHaveBeenCalledWith({
      id: "comp_a",
      name: "Company A",
      email: "a@company-a.test",
      phone: "1234567890",
      address: "1 Main St",
      city: "Copenhagen",
      state: "Capital",
      zip: "1000",
      country: "dk",
      logo_url: null,
      currency_code: "eur",
      spending_limit_reset_frequency: "monthly",
    })
  })
})
