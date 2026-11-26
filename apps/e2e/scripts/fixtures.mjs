// Create synthetic companies, employees, carts with approval requests and a
// quote through the Admin and Store APIs of a seeded backend.

import { randomBytes } from "node:crypto"

const address = {
  first_name: "E2E",
  last_name: "Buyer",
  address_1: "1 Test Street",
  city: "Copenhagen",
  postal_code: "1000",
  country_code: "dk",
  phone: "12345678",
}

export const createFixtures = async ({ backendUrl, admin, runId }) => {
  let publishableKey

  const call = async (path, { body, token, store = false } = {}) => {
    const headers = { "content-type": "application/json" }
    if (store) {
      headers["x-publishable-api-key"] = publishableKey
    }
    if (token) {
      headers.authorization = `Bearer ${token}`
    }

    const response = await fetch(`${backendUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(
        `${path} returned ${response.status}: ${JSON.stringify(data)}`
      )
    }

    return data
  }

  const adminToken = (await call("/auth/user/emailpass", { body: admin })).token

  const {
    api_keys: [apiKey],
  } = await call("/admin/api-keys?type=publishable&limit=1", {
    token: adminToken,
  })
  publishableKey = apiKey.token

  const { regions } = await call("/store/regions", { store: true })
  const region = regions.find((r) =>
    r.countries.some((country) => country.iso_2 === "dk")
  )
  const { products } = await call(
    `/store/products?region_id=${region.id}&fields=*variants&limit=100`,
    { store: true }
  )
  const variant = products
    .flatMap((product) => product.variants)
    .find((v) => v.sku === "WEBCAM-BLACK")

  const createCompany = async (label, currencyCode) => {
    const {
      companies: [company],
    } = await call("/admin/companies", {
      token: adminToken,
      body: {
        name: `E2E Company ${label} ${runId}`,
        email: `e2e-company-${label.toLowerCase()}-${runId}@example.test`,
        currency_code: currencyCode,
      },
    })
    const {
      company: { approval_settings },
    } = await call(`/admin/companies/${company.id}?fields=*approval_settings`, {
      token: adminToken,
    })
    await call(`/admin/companies/${company.id}/approval-settings`, {
      token: adminToken,
      body: {
        id: approval_settings.id,
        requires_admin_approval: true,
        requires_sales_manager_approval: false,
      },
    })

    return { id: company.id, name: company.name, currencyCode }
  }

  const createEmployee = async (
    label,
    company,
    { isAdmin = false, spendingLimit = 0 } = {}
  ) => {
    const email = `e2e-${label}-${runId}@example.test`
    const password = randomBytes(18).toString("hex")
    const registerToken = (
      await call("/auth/customer/emailpass/register", {
        body: { email, password },
      })
    ).token
    const { customer } = await call("/store/customers", {
      store: true,
      token: registerToken,
      body: { email, first_name: label, last_name: "E2E" },
    })
    await call(`/admin/companies/${company.id}/employees`, {
      token: adminToken,
      body: {
        customer_id: customer.id,
        is_admin: isAdmin,
        spending_limit: spendingLimit,
      },
    })
    const token = (
      await call("/auth/customer/emailpass", { body: { email, password } })
    ).token

    return { email, password, customerId: customer.id, token, company }
  }

  const createCart = async (employee) => {
    const { cart } = await call("/store/carts", {
      store: true,
      token: employee.token,
      body: {
        region_id: region.id,
        email: employee.email,
        shipping_address: address,
        billing_address: address,
        metadata: { company_id: employee.company.id },
      },
    })
    await call(`/store/carts/${cart.id}/line-items`, {
      store: true,
      token: employee.token,
      body: { variant_id: variant.id, quantity: 1 },
    })

    return cart.id
  }

  const requestApproval = async (employee) => {
    const cartId = await createCart(employee)
    await call(`/store/carts/${cartId}/approvals`, {
      store: true,
      token: employee.token,
      body: {},
    })

    return cartId
  }

  // Company A's currency differs from the EUR region, so the Admin quote
  // page shows which currency formats the spending limit.
  const companyA = await createCompany("A", "usd")
  const companyB = await createCompany("B", "eur")

  const buyer = await createEmployee("buyer", companyA, {
    spendingLimit: 1000,
  })
  const colleague = await createEmployee("colleague", companyA)
  const approver = await createEmployee("approver", companyA, {
    isAdmin: true,
  })
  const otherBuyer = await createEmployee("other-buyer", companyB)

  const buyerCartId = await requestApproval(buyer)
  const colleagueCartId = await requestApproval(colleague)
  const otherCompanyCartId = await requestApproval(otherBuyer)

  const quoteCartId = await createCart(buyer)
  const { quote } = await call("/store/quotes", {
    store: true,
    token: buyer.token,
    body: { cart_id: quoteCartId },
  })

  const credentials = ({ email, password, customerId }) => ({
    email,
    password,
    customerId,
  })

  return {
    publishableKey,
    companyA: { id: companyA.id, name: companyA.name },
    buyer: credentials(buyer),
    colleague: credentials(colleague),
    approver: credentials(approver),
    otherBuyer: credentials(otherBuyer),
    carts: {
      buyer: buyerCartId,
      colleague: colleagueCartId,
      otherCompany: otherCompanyCartId,
    },
    quote: { id: quote.id, draftOrderId: quote.draft_order_id },
  }
}
