import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  adminHeaders,
  createAdminUser,
  createStoreUser,
} from "../../utils/admin";
import {
  cartSeeder,
  companySeeder,
  employeeSeeder,
  productSeeder,
  regionSeeder,
  salesChannelSeeder,
} from "../../utils/seeder";
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../utils/store";

jest.setTimeout(60 * 1000);

medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ api, getContainer }) => {
    let buyerHeaders,
      approverHeaders,
      otherApproverHeaders,
      otherBuyerHeaders,
      companyA,
      buyerCart,
      region,
      salesChannel,
      product;

    const storeActor = async (publishableKey, email: string) => {
      const actor = await createStoreUser({
        api,
        storeHeaders: generateStoreHeaders({ publishableKey }),
        email,
      });
      const headers = generateStoreHeaders({ publishableKey });
      headers.headers["Authorization"] = `Bearer ${actor.token}`;
      return { customer: actor.customer, headers };
    };

    const seedCart = (headers, companyId: string) =>
      cartSeeder({
        api,
        storeHeaders: headers,
        data: {
          region_id: region.id,
          sales_channel_id: salesChannel.id,
          metadata: { company_id: companyId },
          items: [{ quantity: 1, variant_id: product.variants[0].id }],
        },
      });

    const listApprovals = async (headers) =>
      (await api.get("/store/approvals", headers)).data;

    beforeEach(async () => {
      const container = getContainer();
      await createAdminUser(adminHeaders, container, api);
      const publishableKey = await generatePublishableKey(container);

      const buyer = await storeActor(publishableKey, "buyer@company-a.test");
      const approver = await storeActor(
        publishableKey,
        "approver@company-a.test"
      );
      const otherApprover = await storeActor(
        publishableKey,
        "approver@company-b.test"
      );
      const otherBuyer = await storeActor(
        publishableKey,
        "buyer@company-b.test"
      );
      buyerHeaders = buyer.headers;
      approverHeaders = approver.headers;
      otherApproverHeaders = otherApprover.headers;
      otherBuyerHeaders = otherBuyer.headers;

      companyA = await companySeeder({
        api,
        adminHeaders,
        data: { name: "Company A", email: "a@company-a.test" },
      });
      const companyB = await companySeeder({
        api,
        adminHeaders,
        data: { name: "Company B", email: "b@company-b.test" },
      });

      await employeeSeeder({
        api,
        adminHeaders,
        companyId: companyA.id,
        data: { customer_id: buyer.customer.id },
      });
      await employeeSeeder({
        api,
        adminHeaders,
        companyId: companyA.id,
        data: { customer_id: approver.customer.id, is_admin: true },
      });
      await employeeSeeder({
        api,
        adminHeaders,
        companyId: companyB.id,
        data: { customer_id: otherApprover.customer.id, is_admin: true },
      });
      await employeeSeeder({
        api,
        adminHeaders,
        companyId: companyB.id,
        data: { customer_id: otherBuyer.customer.id },
      });

      for (const [company, headers] of [
        [companyA, approverHeaders],
        [companyB, otherApproverHeaders],
      ]) {
        await api.post(
          `/store/companies/${company.id}/approval-settings`,
          { requires_admin_approval: true },
          headers
        );
      }

      region = await regionSeeder({ api, adminHeaders, data: {} });
      salesChannel = await salesChannelSeeder({
        api,
        adminHeaders,
        data: {},
      });
      product = await productSeeder({
        api,
        adminHeaders,
        data: { sales_channels: [{ id: salesChannel.id }] },
      });
      await api.post(
        `/admin/api-keys/${publishableKey.id}/sales-channels`,
        { add: [salesChannel.id] },
        adminHeaders
      );

      buyerCart = await seedCart(buyerHeaders, companyA.id);
    });

    describe("POST /store/carts/:id/approvals", () => {
      it("creates an admin approval for the cart owner", async () => {
        const response = await api.post(
          `/store/carts/${buyerCart.id}/approvals`,
          {},
          buyerHeaders
        );

        expect(response.status).toEqual(200);
        expect(response.data.approvals).toEqual([
          expect.objectContaining({
            cart_id: buyerCart.id,
            type: "admin",
            status: "pending",
          }),
        ]);
      });

      it("rejects another company's buyer and creates no approval", async () => {
        const { response } = await api
          .post(`/store/carts/${buyerCart.id}/approvals`, {}, otherBuyerHeaders)
          .catch((e) => e);

        expect(response.status).toEqual(404);
        expect(response.data).toEqual({
          type: "not_found",
          message: `Cart id not found: ${buyerCart.id}`,
        });
        expect(
          (await listApprovals(approverHeaders)).carts_with_approvals
        ).toEqual([]);
      });
    });

    describe("approval moderation", () => {
      let approval;

      beforeEach(async () => {
        approval = (
          await api.post(
            `/store/carts/${buyerCart.id}/approvals`,
            {},
            buyerHeaders
          )
        ).data.approvals[0];
      });

      it("lists the pending approval only for the same company's approver", async () => {
        expect(
          (await listApprovals(approverHeaders)).carts_with_approvals
        ).toEqual([
          expect.objectContaining({
            id: buyerCart.id,
            approvals: [expect.objectContaining({ id: approval.id })],
          }),
        ]);
        expect(
          (await listApprovals(otherApproverHeaders)).carts_with_approvals
        ).toEqual([]);
      });

      it("lets the same company's approver approve the cart", async () => {
        const response = await api.post(
          `/store/approvals/${approval.id}`,
          { status: "approved" },
          approverHeaders
        );

        expect(response.status).toEqual(200);
        expect(response.data.approval).toEqual(
          expect.objectContaining({ id: approval.id, status: "approved" })
        );
      });

      it("returns 404 to another company's approver and keeps the approval pending", async () => {
        for (const status of ["approved", "rejected"]) {
          const { response } = await api
            .post(
              `/store/approvals/${approval.id}`,
              { status },
              otherApproverHeaders
            )
            .catch((e) => e);

          expect(response.status).toEqual(404);
          expect(response.data).toEqual({
            type: "not_found",
            message: `Approval id not found: ${approval.id}`,
          });
        }

        expect(
          (await listApprovals(approverHeaders)).carts_with_approvals
        ).toEqual([
          expect.objectContaining({
            id: buyerCart.id,
            approval_status: expect.objectContaining({ status: "pending" }),
            approvals: [
              expect.objectContaining({
                id: approval.id,
                status: "pending",
                handled_by: null,
              }),
            ],
          }),
        ]);
      });

      it("denies the buyer who is not an approver", async () => {
        const { response } = await api
          .post(
            `/store/approvals/${approval.id}`,
            { status: "approved" },
            buyerHeaders
          )
          .catch((e) => e);

        expect(response.status).toEqual(403);
      });
    });
  },
});
