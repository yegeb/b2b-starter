import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { adminHeaders, createAdminUser } from "../../utils/admin";
import {
  productSeeder,
  regionSeeder,
  salesChannelSeeder,
} from "../../utils/seeder";
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../utils/store";

jest.setTimeout(120 * 1000);

type StoreHeaders = { headers: Record<string, string> };

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    let publicHeaders: StoreHeaders;
    let region: { id: string };
    let salesChannel: { id: string };
    let variantId: string;

    const withToken = (token: string): StoreHeaders => ({
      headers: {
        ...publicHeaders.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    const createCompany = async (name: string) => {
      const {
        companies: [company],
      } = (
        await api.post(
          "/admin/companies",
          {
            name,
            email: `${name.toLowerCase().replace(/\s+/g, "-")}@example.test`,
            currency_code: "usd",
          },
          adminHeaders
        )
      ).data;

      const {
        data: {
          company: { approval_settings },
        },
      } = await api.get(
        `/admin/companies/${company.id}?fields=*approval_settings`,
        adminHeaders
      );

      await api.post(
        `/admin/companies/${company.id}/approval-settings`,
        {
          id: approval_settings.id,
          requires_admin_approval: true,
          requires_sales_manager_approval: false,
        },
        adminHeaders
      );

      return company as { id: string };
    };

    const createEmployee = async (
      companyId: string,
      email: string,
      isAdmin = false
    ) => {
      const registerToken = (
        await api.post("/auth/customer/emailpass/register", {
          email,
          password: "password",
        })
      ).data.token;

      const { customer } = (
        await api.post("/store/customers", { email }, withToken(registerToken))
      ).data;

      await api.post(
        `/admin/companies/${companyId}/employees`,
        { customer_id: customer.id, spending_limit: 0, is_admin: isAdmin },
        adminHeaders
      );

      const token = (
        await api.post("/auth/customer/emailpass", {
          email,
          password: "password",
        })
      ).data.token;

      return {
        customer: customer as { id: string },
        headers: withToken(token),
      };
    };

    const createCartWithApproval = async (
      employee: { headers: StoreHeaders },
      companyId: string,
      email: string
    ) => {
      const { cart } = (
        await api.post(
          "/store/carts",
          {
            region_id: region.id,
            sales_channel_id: salesChannel.id,
            email,
            metadata: { company_id: companyId },
            items: [{ variant_id: variantId, quantity: 1 }],
          },
          employee.headers
        )
      ).data;

      await api.post(`/store/carts/${cart.id}/approvals`, {}, employee.headers);

      return cart as { id: string };
    };

    const listOwnApprovals = (headers: StoreHeaders, query = "") =>
      api.get(`/store/customers/me/approvals${query}`, headers);

    let buyerA: Awaited<ReturnType<typeof createEmployee>>;
    let colleagueA: Awaited<ReturnType<typeof createEmployee>>;
    let adminA: Awaited<ReturnType<typeof createEmployee>>;
    let buyerB: Awaited<ReturnType<typeof createEmployee>>;
    let cartA: { id: string };
    let colleagueCartA: { id: string };
    let cartB: { id: string };

    beforeEach(async () => {
      const container = getContainer();
      await createAdminUser(adminHeaders, container, api);
      const publishableKey = await generatePublishableKey(container);
      publicHeaders = generateStoreHeaders({ publishableKey });

      region = await regionSeeder({ api, adminHeaders, data: {} });
      salesChannel = await salesChannelSeeder({ api, adminHeaders, data: {} });
      const product = await productSeeder({
        api,
        adminHeaders,
        data: { sales_channels: [{ id: salesChannel.id }] },
      });
      variantId = product.variants[0].id;

      await api.post(
        `/admin/api-keys/${publishableKey.id}/sales-channels`,
        { add: [salesChannel.id] },
        adminHeaders
      );

      const companyA = await createCompany("Company A");
      const companyB = await createCompany("Company B");

      buyerA = await createEmployee(companyA.id, "buyer-a@example.test");
      colleagueA = await createEmployee(
        companyA.id,
        "colleague-a@example.test"
      );
      adminA = await createEmployee(companyA.id, "admin-a@example.test", true);
      buyerB = await createEmployee(companyB.id, "buyer-b@example.test");

      cartA = await createCartWithApproval(
        buyerA,
        companyA.id,
        "buyer-a@example.test"
      );
      colleagueCartA = await createCartWithApproval(
        colleagueA,
        companyA.id,
        "colleague-a@example.test"
      );
      cartB = await createCartWithApproval(
        buyerB,
        companyB.id,
        "buyer-b@example.test"
      );
    });

    describe("GET /store/customers/me/approvals", () => {
      it("returns only the signed-in buyer's own carts with pending approvals", async () => {
        const response = await listOwnApprovals(
          buyerA.headers,
          "?status=pending"
        );

        expect(response.status).toEqual(200);
        expect(response.data.count).toEqual(1);
        expect(response.data.carts_with_approvals).toEqual([
          expect.objectContaining({
            id: cartA.id,
            customer_id: buyerA.customer.id,
            approval_status: expect.objectContaining({ status: "pending" }),
            approvals: [
              expect.objectContaining({
                cart_id: cartA.id,
                type: "admin",
                status: "pending",
              }),
            ],
          }),
        ]);
      });

      it("never returns a colleague's or another company's carts", async () => {
        const colleague = await listOwnApprovals(colleagueA.headers);
        const otherCompany = await listOwnApprovals(buyerB.headers);
        const companyAdmin = await listOwnApprovals(adminA.headers);

        expect(
          colleague.data.carts_with_approvals.map((cart) => cart.id)
        ).toEqual([colleagueCartA.id]);
        expect(
          otherCompany.data.carts_with_approvals.map((cart) => cart.id)
        ).toEqual([cartB.id]);
        expect(companyAdmin.data.carts_with_approvals).toEqual([]);
        expect(companyAdmin.data.count).toEqual(0);
      });

      it("filters by approval status", async () => {
        const response = await listOwnApprovals(
          buyerA.headers,
          "?status=approved"
        );

        expect(response.status).toEqual(200);
        expect(response.data.carts_with_approvals).toEqual([]);
        expect(response.data.count).toEqual(0);
      });

      it("rejects an unknown status", async () => {
        const error = await listOwnApprovals(
          buyerA.headers,
          "?status=unknown"
        ).catch((e) => e);

        expect(error.response.status).toEqual(400);
      });

      it("requires a signed-in customer", async () => {
        const error = await listOwnApprovals(publicHeaders).catch((e) => e);

        expect(error.response.status).toEqual(401);
      });
    });

    describe("GET /store/approvals", () => {
      it("stays limited to company admins", async () => {
        const error = await api
          .get("/store/approvals?status=pending", buyerA.headers)
          .catch((e) => e);
        const companyAdmin = await api.get(
          "/store/approvals?status=pending",
          adminA.headers
        );

        expect(error.response.status).toEqual(403);
        expect(
          companyAdmin.data.carts_with_approvals.map((cart) => cart.id).sort()
        ).toEqual([cartA.id, colleagueCartA.id].sort());
      });
    });
  },
});
