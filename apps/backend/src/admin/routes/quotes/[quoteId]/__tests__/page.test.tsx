import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderPreview } from "../../../../hooks/api";
import {
  useQuote,
  useRejectQuote,
  useSendQuote,
} from "../../../../hooks/api/quotes";
import QuoteDetails from "../page";

vi.mock("../../../../hooks/api", () => ({ useOrderPreview: vi.fn() }));
vi.mock("../../../../hooks/api/quotes", () => ({
  useQuote: vi.fn(),
  useRejectQuote: vi.fn(),
  useSendQuote: vi.fn(),
}));
vi.mock("@medusajs/dashboard/components", () => ({
  JsonViewSection: () => null,
}));
vi.mock("../../components/quote-details", () => ({
  CostBreakdown: () => null,
  QuoteDetailsHeader: () => null,
  QuoteItems: () => null,
  QuoteTotal: () => null,
}));
vi.mock("../../components/quote-messages", () => ({
  QuoteMessages: () => null,
}));

type Employee = {
  id: string;
  spending_limit: number;
  company?: { id: string; name: string; currency_code: string };
};

const companyA = {
  id: "comp_a",
  name: "Company A",
  currency_code: "eur",
};

const buildCustomer = (employee?: Employee) => ({
  id: "cus_buyer",
  email: "buyer@example.test",
  phone: null,
  ...(employee ? { employee } : {}),
});

/**
 * Return the quote fields that the Admin API returns for the requested
 * `fields` query: the default quote fields include `*customer`, and a
 * relation such as the employee is present only when it is requested.
 */
const mockQuoteApi = (employee?: Employee) => {
  vi.mocked(useQuote).mockImplementation(((
    _id: string,
    query?: { fields?: string }
  ) => {
    const requested = (query?.fields ?? "").split(",");
    const include = (path: string) =>
      requested.includes(`*${path}`) && employee ? { employee } : {};

    const customer = buildCustomer();

    return {
      isLoading: false,
      quote: {
        id: "quo_1",
        status: "pending_merchant",
        draft_order_id: "order_1",
        customer: { ...customer, ...include("customer.employee") },
        draft_order: {
          id: "order_1",
          currency_code: "eur",
          customer: {
            ...customer,
            ...include("draft_order.customer.employee"),
          },
        },
      },
    };
  }) as unknown as typeof useQuote);
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/quotes/quo_1"]}>
      <Routes>
        <Route path="/quotes/:quoteId" element={<QuoteDetails />} />
      </Routes>
    </MemoryRouter>
  );

const fieldValue = (label: string) =>
  screen.getByText(label).parentElement?.lastElementChild;

beforeEach(() => {
  vi.mocked(useOrderPreview).mockReturnValue({
    order: { id: "order_1" },
    isLoading: false,
  } as unknown as ReturnType<typeof useOrderPreview>);
  vi.mocked(useSendQuote).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useSendQuote>);
  vi.mocked(useRejectQuote).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useRejectQuote>);
});

describe("Admin quote details", () => {
  it("shows the employee spending limit and links to the company", () => {
    mockQuoteApi({ id: "emp_buyer", spending_limit: 1000, company: companyA });

    renderPage();

    expect(fieldValue("Spending Limit")?.textContent).toBe("€1,000.00");

    const companyLink = screen.getByRole("link", { name: "Company A" });
    expect(companyLink.getAttribute("href")).toBe("/companies/comp_a");
  });

  it("shows placeholders for a customer without an employee record", () => {
    mockQuoteApi();

    renderPage();

    expect(fieldValue("Spending Limit")?.textContent).toBe("-");
    expect(fieldValue("Name")?.textContent).toBe("-");
    expect(
      screen
        .queryAllByRole("link")
        .some((link) => link.getAttribute("href")?.includes("/companies/"))
    ).toBe(false);
  });
});
