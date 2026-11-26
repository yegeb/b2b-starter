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

const quoteNotFound = (id: string) => ({
  type: "not_found",
  message: `Quote id not found: ${id}`,
});

const cartNotFound = (id: string) => ({
  type: "not_found",
  message: `Cart id not found: ${id}`,
});

medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ api, getContainer }) => {
    let ownerHeaders, otherBuyerHeaders, ownerCart, quote;

    beforeEach(async () => {
      const container = getContainer();
      await createAdminUser(adminHeaders, container, api);
      const publishableKey = await generatePublishableKey(container);

      const owner = await createStoreUser({
        api,
        storeHeaders: generateStoreHeaders({ publishableKey }),
        email: "buyer-a@company-a.test",
      });
      ownerHeaders = generateStoreHeaders({ publishableKey });
      ownerHeaders.headers["Authorization"] = `Bearer ${owner.token}`;

      const otherBuyer = await createStoreUser({
        api,
        storeHeaders: generateStoreHeaders({ publishableKey }),
        email: "buyer-b@company-b.test",
      });
      otherBuyerHeaders = generateStoreHeaders({ publishableKey });
      otherBuyerHeaders.headers["Authorization"] = `Bearer ${otherBuyer.token}`;

      const companyA = await companySeeder({
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
        data: { customer_id: owner.customer.id },
      });
      await employeeSeeder({
        api,
        adminHeaders,
        companyId: companyB.id,
        data: { customer_id: otherBuyer.customer.id },
      });

      const region = await regionSeeder({ api, adminHeaders, data: {} });
      const salesChannel = await salesChannelSeeder({
        api,
        adminHeaders,
        data: {},
      });
      const product = await productSeeder({
        api,
        adminHeaders,
        data: { sales_channels: [{ id: salesChannel.id }] },
      });
      await api.post(
        `/admin/api-keys/${publishableKey.id}/sales-channels`,
        { add: [salesChannel.id] },
        adminHeaders
      );

      ownerCart = await cartSeeder({
        api,
        storeHeaders: ownerHeaders,
        data: {
          region_id: region.id,
          sales_channel_id: salesChannel.id,
          metadata: { company_id: companyA.id },
          items: [{ quantity: 1, variant_id: product.variants[0].id }],
        },
      });

      quote = (
        await api.post("/store/quotes", { cart_id: ownerCart.id }, ownerHeaders)
      ).data.quote;
    });

    const getOwnerQuote = async () =>
      (await api.get(`/store/quotes/${quote.id}`, ownerHeaders)).data.quote;

    describe("GET /store/quotes/:id", () => {
      it("returns the quote to its owner", async () => {
        const response = await api.get(
          `/store/quotes/${quote.id}`,
          ownerHeaders
        );

        expect(response.status).toEqual(200);
        expect(response.data.quote).toEqual(
          expect.objectContaining({ id: quote.id })
        );
      });

      it("returns 404 without quote data to another company's buyer", async () => {
        const { response } = await api
          .get(`/store/quotes/${quote.id}`, otherBuyerHeaders)
          .catch((e) => e);

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(quoteNotFound(quote.id));
      });
    });

    describe("GET /store/quotes/:id/preview", () => {
      it("returns the order preview to the quote owner", async () => {
        const response = await api.get(
          `/store/quotes/${quote.id}/preview`,
          ownerHeaders
        );

        expect(response.status).toEqual(200);
        expect(response.data.quote).toEqual(
          expect.objectContaining({
            id: quote.id,
            order_preview: expect.objectContaining({
              id: quote.draft_order_id,
              items: [expect.objectContaining({ quantity: 1 })],
            }),
          })
        );
      });

      it("returns 404 without quote or draft order data to another company's buyer", async () => {
        const { response } = await api
          .get(`/store/quotes/${quote.id}/preview`, otherBuyerHeaders)
          .catch((e) => e);

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(quoteNotFound(quote.id));
      });
    });

    describe("POST /store/quotes/:id/messages", () => {
      it("adds the owner's message to the quote", async () => {
        const response = await api.post(
          `/store/quotes/${quote.id}/messages`,
          { text: "Can you lower the price?" },
          ownerHeaders
        );

        expect(response.status).toEqual(200);
        expect(response.data.quote.messages).toEqual([
          expect.objectContaining({ text: "Can you lower the price?" }),
        ]);
      });

      it("rejects another company's buyer and keeps the quote unchanged", async () => {
        const { response } = await api
          .post(
            `/store/quotes/${quote.id}/messages`,
            { text: "Not my quote" },
            otherBuyerHeaders
          )
          .catch((e) => e);

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(quoteNotFound(quote.id));
        expect((await getOwnerQuote()).messages).toEqual([]);
      });
    });

    describe("POST /store/quotes/:id/accept", () => {
      beforeEach(async () => {
        await api.post(`/admin/quotes/${quote.id}/send`, {}, adminHeaders);
      });

      it("rejects another company's buyer and keeps the quote and draft order unchanged", async () => {
        const { response } = await api
          .post(`/store/quotes/${quote.id}/accept`, {}, otherBuyerHeaders)
          .catch((e) => e);

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(quoteNotFound(quote.id));

        const ownerQuote = (
          await api.get(
            `/store/quotes/${quote.id}?fields=+draft_order.is_draft_order`,
            ownerHeaders
          )
        ).data.quote;
        expect(ownerQuote.status).toEqual("pending_customer");
        expect(ownerQuote.draft_order).toEqual(
          expect.objectContaining({ status: "draft", is_draft_order: true })
        );
      });

      it("still lets the owner accept the quote", async () => {
        const response = await api.post(
          `/store/quotes/${quote.id}/accept`,
          {},
          ownerHeaders
        );

        expect(response.status).toEqual(200);
        expect(response.data.quote.status).toEqual("accepted");
      });
    });

    describe("POST /store/quotes/:id/reject", () => {
      beforeEach(async () => {
        await api.post(`/admin/quotes/${quote.id}/send`, {}, adminHeaders);
      });

      it("rejects another company's buyer and keeps the quote unchanged", async () => {
        const { response } = await api
          .post(`/store/quotes/${quote.id}/reject`, {}, otherBuyerHeaders)
          .catch((e) => e);

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(quoteNotFound(quote.id));
        expect((await getOwnerQuote()).status).toEqual("pending_customer");
      });

      it("still lets the owner reject the quote", async () => {
        const response = await api.post(
          `/store/quotes/${quote.id}/reject`,
          {},
          ownerHeaders
        );

        expect(response.status).toEqual(200);
        expect(response.data.quote.status).toEqual("customer_rejected");
      });
    });

    describe("POST /store/quotes", () => {
      it("rejects a quote request for another buyer's cart", async () => {
        const { response } = await api
          .post("/store/quotes", { cart_id: ownerCart.id }, otherBuyerHeaders)
          .catch((e) => e);

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(cartNotFound(ownerCart.id));

        const otherBuyerQuotes = (
          await api.get("/store/quotes", otherBuyerHeaders)
        ).data.quotes;
        expect(otherBuyerQuotes).toEqual([]);

        const ownerQuotes = (await api.get("/store/quotes", ownerHeaders)).data
          .quotes;
        expect(ownerQuotes.map(({ id }) => id)).toEqual([quote.id]);
      });
    });
  },
});
