import Approvals from "@/app/[countryCode]/(main)/account/@dashboard/approvals/page"
import Orders from "@/app/[countryCode]/(main)/account/@dashboard/orders/page"
import { listApprovals } from "@/lib/data/approvals"
import { retrieveCompany } from "@/lib/data/companies"
import { retrieveCustomer } from "@/lib/data/customer"
import { listOrders } from "@/lib/data/orders"
import AccountLayout from "@/modules/account/templates/account-layout"
import { B2BCustomer } from "@/types"
import { ApprovalStatusType, ApprovalType } from "@/types/approval"
import { render, screen } from "@testing-library/react"
import { ReactElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/data/approvals", () => ({ listApprovals: vi.fn() }))
vi.mock("@/lib/data/companies", () => ({ retrieveCompany: vi.fn() }))
vi.mock("@/lib/data/customer", () => ({ retrieveCustomer: vi.fn() }))
vi.mock("@/lib/data/orders", () => ({ listOrders: vi.fn() }))

vi.mock("@/modules/account/components/account-nav", () => ({
  default: ({ numPendingApprovals }: { numPendingApprovals: number }) => (
    <nav>Pending approvals: {numPendingApprovals}</nav>
  ),
}))
// Each list loads approvals from the admin-only Store API when it renders.
vi.mock(
  "@/modules/account/components/approval-requests-admin-list/pending-list",
  () => ({ default: () => <p>Pending approval list</p> })
)
vi.mock(
  "@/modules/account/components/approval-requests-admin-list/approved-list",
  () => ({ default: () => <p>Approved approval list</p> })
)
vi.mock(
  "@/modules/account/components/approval-requests-admin-list/rejected-list",
  () => ({ default: () => <p>Rejected approval list</p> })
)
vi.mock("@/modules/account/components/order-overview", () => ({
  default: () => <div>Order overview</div>,
}))
vi.mock("@/modules/account/components/pending-customer-approvals", () => ({
  default: ({
    cartsWithApprovals,
  }: {
    cartsWithApprovals: { id: string }[]
  }) => (
    <ul>
      {cartsWithApprovals.map((cart) => (
        <li key={cart.id}>{cart.id}</li>
      ))}
    </ul>
  ),
}))

const makeCustomer = (isAdmin: boolean) =>
  ({
    id: isAdmin ? "cus_approver" : "cus_buyer",
    email: isAdmin ? "approver@example.test" : "buyer@example.test",
    employee: {
      id: isAdmin ? "emp_approver" : "emp_buyer",
      company_id: "comp_a",
      is_admin: isAdmin,
    },
  } as unknown as B2BCustomer)

const buyer = makeCustomer(false)
const approver = makeCustomer(true)
const pendingCart = { id: "cart_pending" }

// Mirror the Store API: only company admins may list approvals.
const mockApprovalsFor = (customer: B2BCustomer) => {
  vi.mocked(listApprovals).mockImplementation(async () => {
    if (!customer.employee?.is_admin) {
      throw new Error("Forbidden")
    }

    return { carts_with_approvals: [pendingCart], count: 1 } as Awaited<
      ReturnType<typeof listApprovals>
    >
  })
}

const renderOrdersFor = async (customer: B2BCustomer) => {
  vi.mocked(retrieveCustomer).mockResolvedValue(customer)
  mockApprovalsFor(customer)

  render((await Orders()) as ReactElement)
}

beforeEach(() => {
  vi.mocked(listOrders).mockResolvedValue([])
  vi.mocked(retrieveCompany).mockResolvedValue({
    id: "comp_a",
    approval_settings: { requires_admin_approval: true },
  } as Awaited<ReturnType<typeof retrieveCompany>>)
})

describe("account layout", () => {
  it("renders an ordinary employee's account without listing approvals", async () => {
    mockApprovalsFor(buyer)

    const layout = await AccountLayout({
      customer: buyer,
      children: <p>Account content</p>,
    })
    render(layout as ReactElement)

    expect(listApprovals).not.toHaveBeenCalled()
    expect(screen.getByText("Account content")).toBeTruthy()
    expect(screen.getByRole("navigation").textContent).toBe(
      "Pending approvals: 0"
    )
  })

  it("passes a company admin's pending approval count to the navigation", async () => {
    mockApprovalsFor(approver)

    const layout = await AccountLayout({
      customer: approver,
      children: <p>Account content</p>,
    })
    render(layout as ReactElement)

    expect(listApprovals).toHaveBeenCalledWith({
      type: ApprovalType.ADMIN,
      status: ApprovalStatusType.PENDING,
    })
    expect(screen.getByRole("navigation").textContent).toBe(
      "Pending approvals: 1"
    )
  })
})

describe("orders page", () => {
  it("renders an ordinary employee's orders without the pending approvals section", async () => {
    await renderOrdersFor(buyer)

    expect(listApprovals).not.toHaveBeenCalled()
    expect(screen.getByText("Order overview")).toBeTruthy()
    expect(screen.queryByText("Pending Approvals")).toBeNull()
  })

  it("lists pending approvals for a company admin", async () => {
    await renderOrdersFor(approver)

    expect(listApprovals).toHaveBeenCalledWith({
      status: ApprovalStatusType.PENDING,
    })
    expect(screen.getByText("Pending Approvals")).toBeTruthy()
    expect(screen.getByText(pendingCart.id)).toBeTruthy()
  })
})

describe("approvals page", () => {
  const renderApprovalsFor = async (customer: B2BCustomer) => {
    vi.mocked(retrieveCustomer).mockResolvedValue(customer)

    render(
      (await Approvals({ searchParams: Promise.resolve({}) })) as ReactElement
    )
  }

  it("tells an ordinary employee that approvals are not available", async () => {
    await renderApprovalsFor(buyer)

    expect(
      screen.getByText("Only company admins can review approval requests.")
    ).toBeTruthy()
    expect(screen.queryByText(/approval list/)).toBeNull()
  })

  it("lists approval requests for a company admin", async () => {
    await renderApprovalsFor(approver)

    expect(screen.getByText("Pending approval list")).toBeTruthy()
    expect(screen.getByText("Approved approval list")).toBeTruthy()
    expect(screen.getByText("Rejected approval list")).toBeTruthy()
    expect(
      screen.queryByText("Only company admins can review approval requests.")
    ).toBeNull()
  })
})
