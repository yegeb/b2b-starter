import { randomBytes } from "node:crypto";
import {
  medusaIntegrationTestRunner,
  waitSubscribersExecution,
} from "@medusajs/test-utils";
import {
  ContainerRegistrationKeys,
  Modules,
  PUBLISHABLE_KEY_HEADER,
} from "@medusajs/framework/utils";
import initialDataSeed from "../../../src/migration-scripts/initial-data-seed";
import { updateEmployeesWorkflow } from "../../../src/workflows/employee/workflows";
import {
  COMPANY_ADMIN_ROLE,
  createDemoFixtures,
  DEMO_EMAILS,
  DEMO_PAYMENT_PROVIDER_ID,
  DEMO_SKU,
  DemoAccountKey,
  DemoFixtures,
} from "../../../src/scripts/demo-fixtures";

jest.setTimeout(120 * 1000);

const randomSecret = () => randomBytes(24).toString("base64url");

const passwords: Record<DemoAccountKey, string> = {
  merchant: randomSecret(),
  buyer_a: randomSecret(),
  approver_a: randomSecret(),
  buyer_b: randomSecret(),
};

// The suite signs in through the real auth routes, so it needs no JWT secret.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let fixtures: DemoFixtures;
    let publishableKey: string;
    let productOptionErrors: unknown[][];

    const bearer = (token: string) => ({
      headers: { authorization: `Bearer ${token}` },
    });

    const storeHeaders = (token?: string) => ({
      headers: {
        [PUBLISHABLE_KEY_HEADER]: publishableKey,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });

    const customerToken = async (key: Exclude<DemoAccountKey, "merchant">) =>
      (
        await api.post("/auth/customer/emailpass", {
          email: DEMO_EMAILS[key],
          password: passwords[key],
        })
      ).data.token as string;

    const merchantToken = async () =>
      (
        await api.post("/auth/user/emailpass", {
          email: DEMO_EMAILS.merchant,
          password: passwords.merchant,
        })
      ).data.token as string;

    // Data created in beforeAll is part of the snapshot that the runner
    // restores before each test.
    beforeAll(async () => {
      const container = getContainer();
      const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
      const loggedError = jest.spyOn(logger, "error");
      const productOptionsHandled = waitSubscribersExecution(
        "product-option.created",
        container.resolve(Modules.EVENT_BUS)
      );
      try {
        await initialDataSeed({ container });
        await productOptionsHandled;
      } finally {
        productOptionErrors = loggedError.mock.calls.filter((args) =>
          args.some((arg) => String(arg).includes("product-option.created"))
        );
        loggedError.mockRestore();
      }

      fixtures = await createDemoFixtures(container, { passwords });

      const query = container.resolve(ContainerRegistrationKeys.QUERY);
      const {
        data: [apiKey],
      } = await query.graph({
        entity: "api_key",
        fields: ["token"],
        filters: { id: fixtures.storefront.publishable_api_key_id },
      });
      publishableKey = apiKey.token;
    });

    it("seeds the catalog without product-option.created processing errors", () => {
      expect(productOptionErrors).toEqual([]);
    });

    it("uses the provided passwords and reports no generated ones", () => {
      const accounts = [fixtures.merchant, ...Object.values(fixtures.employees)];

      for (const account of accounts) {
        expect(account).toEqual(
          expect.objectContaining({ created: true, password_generated: false })
        );
      }
    });

    it("lets the merchant sign in to the admin API", async () => {
      const token = await merchantToken();
      const { data } = await api.get("/admin/users/me", bearer(token));

      expect(data.user).toEqual(
        expect.objectContaining({
          id: fixtures.merchant.user_id,
          email: DEMO_EMAILS.merchant,
        })
      );
    });

    it("assigns each buyer and the approver to the expected company and role", async () => {
      const expected = {
        buyer_a: { company: fixtures.companies.company_a.id, is_admin: false },
        approver_a: {
          company: fixtures.companies.company_a.id,
          is_admin: true,
        },
        buyer_b: { company: fixtures.companies.company_b.id, is_admin: true },
      };

      expect(fixtures.companies.company_a.id).not.toEqual(
        fixtures.companies.company_b.id
      );

      for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
        const token = await customerToken(key);
        const { data } = await api.get(
          "/store/customers/me?fields=*employee",
          storeHeaders(token)
        );

        expect(data.customer).toEqual(
          expect.objectContaining({
            id: fixtures.employees[key].customer_id,
            email: DEMO_EMAILS[key],
            employee: expect.objectContaining({
              id: fixtures.employees[key].employee_id,
              company_id: expected[key].company,
              is_admin: expected[key].is_admin,
            }),
          })
        );
      }

      const query = getContainer().resolve(ContainerRegistrationKeys.QUERY);
      const { data: identities } = await query.graph({
        entity: "provider_identity",
        fields: ["entity_id", "user_metadata"],
        filters: {
          provider: "emailpass",
          entity_id: [
            DEMO_EMAILS.buyer_a,
            DEMO_EMAILS.approver_a,
            DEMO_EMAILS.buyer_b,
          ],
        },
      });
      const roles = Object.fromEntries(
        identities.map((identity) => [
          identity.entity_id,
          identity.user_metadata?.role ?? null,
        ])
      );

      expect(roles).toEqual({
        [DEMO_EMAILS.buyer_a]: null,
        [DEMO_EMAILS.approver_a]: COMPANY_ADMIN_ROLE,
        [DEMO_EMAILS.buyer_b]: COMPANY_ADMIN_ROLE,
      });
    });

    it("lists company members and approval settings in the admin API", async () => {
      const token = await merchantToken();

      const companyA = (
        await api.get(
          `/admin/companies/${fixtures.companies.company_a.id}?fields=*employees,*approval_settings`,
          bearer(token)
        )
      ).data.company;
      const companyB = (
        await api.get(
          `/admin/companies/${fixtures.companies.company_b.id}?fields=*employees,*approval_settings`,
          bearer(token)
        )
      ).data.company;

      expect(companyA.employees.map((employee) => employee.id).sort()).toEqual(
        [
          fixtures.employees.buyer_a.employee_id,
          fixtures.employees.approver_a.employee_id,
        ].sort()
      );
      expect(companyB.employees.map((employee) => employee.id)).toEqual([
        fixtures.employees.buyer_b.employee_id,
      ]);

      expect(companyA.approval_settings).toEqual(
        expect.objectContaining({
          id: fixtures.companies.company_a.approval_settings_id,
          requires_admin_approval: true,
          requires_sales_manager_approval: false,
        })
      );
      expect(companyB.approval_settings).toEqual(
        expect.objectContaining({
          id: fixtures.companies.company_b.approval_settings_id,
          requires_admin_approval: false,
          requires_sales_manager_approval: false,
        })
      );
    });

    it("lets buyer A create a Denmark cart at EUR 59 and pay with the system provider", async () => {
      const token = await customerToken("buyer_a");
      const { storefront, companies } = fixtures;

      const { data: providers } = await api.get(
        `/store/payment-providers?region_id=${storefront.region_id}`,
        storeHeaders(token)
      );
      expect(
        providers.payment_providers.map((provider) => provider.id)
      ).toContain(DEMO_PAYMENT_PROVIDER_ID);

      const { data: created } = await api.post(
        "/store/carts?fields=*items,*company",
        {
          region_id: storefront.region_id,
          sales_channel_id: storefront.sales_channel_id,
          email: DEMO_EMAILS.buyer_a,
          metadata: { company_id: companies.company_a.id },
          shipping_address: {
            first_name: "Buyer",
            last_name: "A",
            address_1: "Demo Street 1",
            city: "Copenhagen",
            postal_code: "1050",
            country_code: storefront.country_code,
          },
          items: [{ variant_id: storefront.variant_id, quantity: 1 }],
        },
        storeHeaders(token)
      );
      const cart = created.cart;

      expect(cart).toEqual(
        expect.objectContaining({
          region_id: storefront.region_id,
          currency_code: "eur",
          customer_id: fixtures.employees.buyer_a.customer_id,
          shipping_address: expect.objectContaining({ country_code: "dk" }),
          company: expect.objectContaining({ id: companies.company_a.id }),
        })
      );
      expect(cart.items).toEqual([
        expect.objectContaining({
          variant_id: storefront.variant_id,
          variant_sku: DEMO_SKU,
          quantity: 1,
          unit_price: 59,
        }),
      ]);
      expect(cart.item_subtotal).toEqual(59);

      const { data: collection } = await api.post(
        "/store/payment-collections",
        { cart_id: cart.id },
        storeHeaders(token)
      );
      expect(collection.payment_collection).toEqual(
        expect.objectContaining({ amount: cart.total, currency_code: "eur" })
      );

      const { data: session } = await api.post(
        `/store/payment-collections/${collection.payment_collection.id}/payment-sessions`,
        { provider_id: DEMO_PAYMENT_PROVIDER_ID },
        storeHeaders(token)
      );
      expect(session.payment_collection.payment_sessions).toEqual([
        expect.objectContaining({
          provider_id: DEMO_PAYMENT_PROVIDER_ID,
          currency_code: "eur",
          status: "pending",
        }),
      ]);
    });

    it("reuses existing records on a second run without changing passwords", async () => {
      const onPasswordGenerated = jest.fn();
      const rerun = await createDemoFixtures(getContainer(), {
        onPasswordGenerated,
      });

      expect(onPasswordGenerated).not.toHaveBeenCalled();

      expect(rerun.storefront).toEqual(fixtures.storefront);
      expect(rerun.merchant.user_id).toEqual(fixtures.merchant.user_id);
      expect(rerun.merchant.created).toBe(false);
      for (const key of Object.keys(fixtures.companies)) {
        expect(rerun.companies[key]).toEqual(fixtures.companies[key]);
      }
      for (const key of Object.keys(fixtures.employees)) {
        expect(rerun.employees[key]).toEqual(
          expect.objectContaining({
            customer_id: fixtures.employees[key].customer_id,
            employee_id: fixtures.employees[key].employee_id,
            created: false,
            password_generated: false,
          })
        );
      }

      // The original password still works.
      await expect(customerToken("buyer_a")).resolves.toEqual(
        expect.any(String)
      );
    });

    it("stops before creating any account when an existing employee has another role", async () => {
      const container = getContainer();
      const userModule = container.resolve(Modules.USER);
      const authModule = container.resolve(Modules.AUTH);

      await userModule.deleteUsers([fixtures.merchant.user_id]);
      const [merchantIdentity] = await authModule.listProviderIdentities({
        provider: "emailpass",
        entity_id: DEMO_EMAILS.merchant,
      });
      await authModule.deleteAuthIdentities([
        merchantIdentity.auth_identity_id!,
      ]);
      await updateEmployeesWorkflow(container).run({
        input: { id: fixtures.employees.approver_a.employee_id, is_admin: false },
      });

      const onPasswordGenerated = jest.fn();
      await expect(
        createDemoFixtures(container, { onPasswordGenerated })
      ).rejects.toThrow(
        `${DEMO_EMAILS.approver_a} is already employee ` +
          fixtures.employees.approver_a.employee_id
      );

      expect(onPasswordGenerated).not.toHaveBeenCalled();
      expect(
        await userModule.listUsers({ email: DEMO_EMAILS.merchant })
      ).toEqual([]);
    });
  },
});
