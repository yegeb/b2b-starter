import { randomBytes } from "node:crypto";
import {
  ExecArgs,
  IAuthModuleService,
  IUserModuleService,
  MedusaContainer,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import {
  createCustomerAccountWorkflow,
  createUserAccountWorkflow,
} from "@medusajs/medusa/core-flows";
import { ModuleCompanySpendingLimitResetFrequency } from "../types";
import { updateApprovalSettingsWorkflow } from "../workflows/approval/workflows";
import { createCompaniesWorkflow } from "../workflows/company/workflows";
import { createEmployeesWorkflow } from "../workflows/employee/workflows";

/**
 * Creates the CMPE 48A milestone 01 demo fixtures on a database that the
 * initial data seed already populated:
 *
 * - Company A requires company admin approval. Company B requires no approval.
 * - Buyer A is an ordinary employee of company A.
 * - Approver A is a company admin of company A.
 * - Buyer B is a company admin of company B.
 * - The merchant is an admin dashboard user.
 *
 * The script also verifies that a storefront can put `WEBCAM-BLACK` in a
 * Denmark cart at EUR 59 and pay with the system payment provider.
 *
 * Run it from `apps/backend`:
 *
 * ```sh
 * pnpm medusa exec ./src/scripts/demo-fixtures.ts
 * ```
 *
 * Passwords come from the environment variables in `PASSWORD_ENV`. The script
 * generates a password for each new account whose variable is not set and
 * prints it once. A second run reuses existing records and does not change
 * passwords.
 */

export const DEMO_COUNTRY_CODE = "dk";
export const DEMO_CURRENCY_CODE = "eur";
export const DEMO_SKU = "WEBCAM-BLACK";
export const DEMO_UNIT_PRICE = 59;
export const DEMO_PAYMENT_PROVIDER_ID = "pp_system_default";
export const COMPANY_ADMIN_ROLE = "company_admin";

export type DemoAccountKey = "merchant" | "buyer_a" | "approver_a" | "buyer_b";
export type DemoCustomerKey = Exclude<DemoAccountKey, "merchant">;
export type DemoCompanyKey = "company_a" | "company_b";

export const PASSWORD_ENV: Record<DemoAccountKey, string> = {
  merchant: "DEMO_MERCHANT_PASSWORD",
  buyer_a: "DEMO_BUYER_A_PASSWORD",
  approver_a: "DEMO_APPROVER_A_PASSWORD",
  buyer_b: "DEMO_BUYER_B_PASSWORD",
};

export const DEMO_EMAILS: Record<DemoAccountKey, string> = {
  merchant: "merchant@example.test",
  buyer_a: "buyer-a@example.test",
  approver_a: "approver-a@example.test",
  buyer_b: "buyer-b@example.test",
};

const COMPANIES: Record<
  DemoCompanyKey,
  {
    name: string;
    email: string;
    phone: string;
    requires_admin_approval: boolean;
    requires_sales_manager_approval: boolean;
  }
> = {
  company_a: {
    name: "Demo Company A",
    email: "company-a@example.test",
    phone: "+45 00 00 00 01",
    requires_admin_approval: true,
    requires_sales_manager_approval: false,
  },
  company_b: {
    name: "Demo Company B",
    email: "company-b@example.test",
    phone: "+45 00 00 00 02",
    requires_admin_approval: false,
    requires_sales_manager_approval: false,
  },
};

const EMPLOYEES: Record<
  DemoCustomerKey,
  {
    label: string;
    first_name: string;
    last_name: string;
    company: DemoCompanyKey;
    is_admin: boolean;
    spending_limit: number;
  }
> = {
  buyer_a: {
    label: "Buyer A, ordinary employee",
    first_name: "Buyer",
    last_name: "A",
    company: "company_a",
    is_admin: false,
    spending_limit: 1000,
  },
  approver_a: {
    label: "Approver A, company admin",
    first_name: "Approver",
    last_name: "A",
    company: "company_a",
    is_admin: true,
    spending_limit: 1000,
  },
  buyer_b: {
    label: "Buyer B, company admin",
    first_name: "Buyer",
    last_name: "B",
    company: "company_b",
    is_admin: true,
    spending_limit: 1000,
  },
};

export type DemoFixturesInput = {
  /** Passwords for accounts the script creates. Missing ones are generated. */
  passwords?: Partial<Record<DemoAccountKey, string>>;
};

export type DemoAccount = {
  email: string;
  /** Set only when this run created the account. */
  password?: string;
  password_generated: boolean;
  created: boolean;
};

export type DemoFixtures = {
  storefront: {
    region_id: string;
    country_code: string;
    currency_code: string;
    publishable_api_key_id: string;
    sales_channel_id: string;
    product_id: string;
    variant_id: string;
    sku: string;
    unit_price: number;
    payment_provider_id: string;
  };
  merchant: DemoAccount & { label: string; user_id: string };
  companies: Record<
    DemoCompanyKey,
    {
      id: string;
      name: string;
      approval_settings_id: string;
      requires_admin_approval: boolean;
      requires_sales_manager_approval: boolean;
    }
  >;
  employees: Record<
    DemoCustomerKey,
    DemoAccount & {
      label: string;
      customer_id: string;
      employee_id: string;
      company_id: string;
      is_admin: boolean;
    }
  >;
};

// Query results here are read field by field, so a loose shape keeps the script
// independent of the generated entity typings.
type Query = {
  graph: (
    config: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<{ data: any[] }>;
};

const generatePassword = () => randomBytes(18).toString("base64url");

const resolvePassword = (
  key: DemoAccountKey,
  passwords: DemoFixturesInput["passwords"]
) => {
  const provided = passwords?.[key];
  if (provided) {
    return { password: provided, password_generated: false };
  }
  return { password: generatePassword(), password_generated: true };
};

const registerEmailpassIdentity = async (
  container: MedusaContainer,
  email: string,
  password: string
) => {
  const authModule = container.resolve<IAuthModuleService>(Modules.AUTH);
  const { success, authIdentity, error } = await authModule.register(
    "emailpass",
    { body: { email, password } }
  );

  if (!success || !authIdentity) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      `Could not register the demo account ${email}: ${error}. ` +
        "Remove the partial account or reuse its existing password."
    );
  }

  return authIdentity;
};

/** Finds the storefront records that the initial data seed creates. */
const resolveStorefront = async (
  query: Query
): Promise<DemoFixtures["storefront"]> => {
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code", "countries.iso_2", "payment_providers.id"],
  });

  const region = regions.find(
    (candidate) =>
      candidate.currency_code === DEMO_CURRENCY_CODE &&
      candidate.countries?.some(
        (country) => country?.iso_2 === DEMO_COUNTRY_CODE
      ) &&
      candidate.payment_providers?.some(
        (provider) => provider?.id === DEMO_PAYMENT_PROVIDER_ID
      )
  );

  if (!region) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No ${DEMO_CURRENCY_CODE.toUpperCase()} region contains country ` +
        `"${DEMO_COUNTRY_CODE}" and ${DEMO_PAYMENT_PROVIDER_ID}. ` +
        "Run `pnpm medusa db:migrate` on an empty database to apply the initial data seed."
    );
  }

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "sku",
      "prices.amount",
      "prices.currency_code",
      "product.id",
      "product.status",
      "product.sales_channels.id",
    ],
    filters: { sku: DEMO_SKU },
  });

  const variant = variants[0];
  const price = variant?.prices?.find(
    (candidate) =>
      candidate?.currency_code === DEMO_CURRENCY_CODE &&
      Number(candidate?.amount) === DEMO_UNIT_PRICE
  );

  if (!variant || variant.product?.status !== "published" || !price) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No published ${DEMO_SKU} variant has a ${DEMO_CURRENCY_CODE.toUpperCase()} ` +
        `${DEMO_UNIT_PRICE} price. Apply the initial data seed first.`
    );
  }

  const productSalesChannelIds = new Set<string>(
    (variant.product.sales_channels ?? []).map((channel) => channel?.id)
  );

  const { data: apiKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "created_at", "revoked_at", "sales_channels.id"],
    filters: { type: "publishable" },
  });

  const apiKey = apiKeys
    .filter((key) => !key.revoked_at)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    .find((key) =>
      key.sales_channels?.some((channel) =>
        productSalesChannelIds.has(channel?.id)
      )
    );

  if (!apiKey) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No active publishable API key can sell ${DEMO_SKU}. Apply the initial data seed first.`
    );
  }

  const salesChannelId = apiKey.sales_channels.find((channel) =>
    productSalesChannelIds.has(channel?.id)
  ).id;

  return {
    region_id: region.id,
    country_code: DEMO_COUNTRY_CODE,
    currency_code: DEMO_CURRENCY_CODE,
    publishable_api_key_id: apiKey.id,
    sales_channel_id: salesChannelId,
    product_id: variant.product.id,
    variant_id: variant.id,
    sku: DEMO_SKU,
    unit_price: DEMO_UNIT_PRICE,
    payment_provider_id: DEMO_PAYMENT_PROVIDER_ID,
  };
};

const ensureMerchant = async (
  container: MedusaContainer,
  passwords: DemoFixturesInput["passwords"]
): Promise<DemoFixtures["merchant"]> => {
  const email = DEMO_EMAILS.merchant;
  const userModule = container.resolve<IUserModuleService>(Modules.USER);
  const [existing] = await userModule.listUsers({ email });

  if (existing) {
    return {
      label: "Merchant",
      email,
      user_id: existing.id,
      created: false,
      password_generated: false,
    };
  }

  const { password, password_generated } = resolvePassword(
    "merchant",
    passwords
  );
  const authIdentity = await registerEmailpassIdentity(
    container,
    email,
    password
  );
  const { result: user } = await createUserAccountWorkflow(container).run({
    input: {
      authIdentityId: authIdentity.id,
      userData: { email, first_name: "Demo", last_name: "Merchant" },
    },
  });

  return {
    label: "Merchant",
    email,
    user_id: user.id,
    created: true,
    password,
    password_generated,
  };
};

const ensureCompany = async (
  container: MedusaContainer,
  query: Query,
  key: DemoCompanyKey
): Promise<DemoFixtures["companies"][DemoCompanyKey]> => {
  const definition = COMPANIES[key];
  const fields = [
    "id",
    "name",
    "approval_settings.id",
    "approval_settings.requires_admin_approval",
    "approval_settings.requires_sales_manager_approval",
  ];

  let {
    data: [company],
  } = await query.graph({
    entity: "company",
    fields,
    filters: { email: definition.email },
  });

  if (!company) {
    const {
      result: [created],
    } = await createCompaniesWorkflow(container).run({
      input: [
        {
          name: definition.name,
          email: definition.email,
          phone: definition.phone,
          address: null,
          city: "Copenhagen",
          state: null,
          zip: null,
          country: DEMO_COUNTRY_CODE,
          logo_url: null,
          currency_code: DEMO_CURRENCY_CODE,
          spending_limit_reset_frequency:
            ModuleCompanySpendingLimitResetFrequency.MONTHLY,
        },
      ],
    });

    ({
      data: [company],
    } = await query.graph(
      { entity: "company", fields, filters: { id: created.id } },
      { throwIfKeyNotFound: true }
    ));
  }

  const settings = company.approval_settings;
  if (!settings?.id) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Company ${company.id} has no approval settings.`
    );
  }

  if (
    settings.requires_admin_approval !== definition.requires_admin_approval ||
    settings.requires_sales_manager_approval !==
      definition.requires_sales_manager_approval
  ) {
    await updateApprovalSettingsWorkflow(container).run({
      input: {
        id: settings.id,
        requires_admin_approval: definition.requires_admin_approval,
        requires_sales_manager_approval:
          definition.requires_sales_manager_approval,
      },
    });
  }

  return {
    id: company.id,
    name: company.name,
    approval_settings_id: settings.id,
    requires_admin_approval: definition.requires_admin_approval,
    requires_sales_manager_approval: definition.requires_sales_manager_approval,
  };
};

const ensureEmployee = async (
  container: MedusaContainer,
  query: Query,
  key: DemoCustomerKey,
  companyId: string,
  passwords: DemoFixturesInput["passwords"]
): Promise<DemoFixtures["employees"][DemoCustomerKey]> => {
  const definition = EMPLOYEES[key];
  const email = DEMO_EMAILS[key];
  const fields = [
    "id",
    "has_account",
    "employee.id",
    "employee.is_admin",
    "employee.company.id",
  ];

  let account: DemoAccount = {
    email,
    created: false,
    password_generated: false,
  };

  let {
    data: [customer],
  } = await query.graph({
    entity: "customer",
    fields,
    filters: { email, has_account: true },
  });

  if (!customer) {
    const { password, password_generated } = resolvePassword(key, passwords);
    const authIdentity = await registerEmailpassIdentity(
      container,
      email,
      password
    );
    const { result: created } = await createCustomerAccountWorkflow(
      container
    ).run({
      input: {
        authIdentityId: authIdentity.id,
        customerData: {
          email,
          first_name: definition.first_name,
          last_name: definition.last_name,
        },
      },
    });

    account = { email, created: true, password, password_generated };
    customer = { id: created.id, employee: null };
  }

  let employee = customer.employee;

  if (!employee) {
    // The employee workflow stores the company admin role on the customer's
    // emailpass identity, so the account must exist before this step.
    const { result: created } = await createEmployeesWorkflow(container).run({
      input: {
        customerId: customer.id,
        employeeData: {
          customer_id: customer.id,
          company_id: companyId,
          is_admin: definition.is_admin,
          spending_limit: definition.spending_limit,
        },
      },
    });

    ({
      data: [{ employee }],
    } = await query.graph(
      { entity: "customer", fields, filters: { id: customer.id } },
      { throwIfKeyNotFound: true }
    ));

    if (!employee || employee.id !== created.id) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Employee ${created.id} is not linked to customer ${customer.id}.`
      );
    }
  }

  if (
    employee.company?.id !== companyId ||
    employee.is_admin !== definition.is_admin
  ) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      `${email} is already employee ${employee.id} with a different company ` +
        "or admin flag. Use an empty database or fix the record manually."
    );
  }

  return {
    ...account,
    label: definition.label,
    customer_id: customer.id,
    employee_id: employee.id,
    company_id: companyId,
    is_admin: definition.is_admin,
  };
};

export const createDemoFixtures = async (
  container: MedusaContainer,
  input: DemoFixturesInput = {}
): Promise<DemoFixtures> => {
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY);

  const storefront = await resolveStorefront(query);
  const merchant = await ensureMerchant(container, input.passwords);

  const companies = {
    company_a: await ensureCompany(container, query, "company_a"),
    company_b: await ensureCompany(container, query, "company_b"),
  };

  const employees = {} as DemoFixtures["employees"];
  for (const key of Object.keys(EMPLOYEES) as DemoCustomerKey[]) {
    employees[key] = await ensureEmployee(
      container,
      query,
      key,
      companies[EMPLOYEES[key].company].id,
      input.passwords
    );
  }

  return { storefront, merchant, companies, employees };
};

const passwordsFromEnv = () =>
  Object.fromEntries(
    (Object.keys(PASSWORD_ENV) as DemoAccountKey[])
      .filter((key) => process.env[PASSWORD_ENV[key]])
      .map((key) => [key, process.env[PASSWORD_ENV[key]]])
  ) as DemoFixturesInput["passwords"];

const withoutPassword = <T extends DemoAccount>({ password, ...rest }: T) =>
  rest;

export default async function demoFixtures({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const fixtures = await createDemoFixtures(container, {
    passwords: passwordsFromEnv(),
  });

  const accounts: [DemoAccountKey, DemoAccount][] = [
    ["merchant", fixtures.merchant],
    ...(Object.entries(fixtures.employees) as [DemoCustomerKey, DemoAccount][]),
  ];

  const summary = {
    ...fixtures,
    merchant: withoutPassword(fixtures.merchant),
    employees: Object.fromEntries(
      Object.entries(fixtures.employees).map(([key, employee]) => [
        key,
        withoutPassword(employee),
      ])
    ),
  };

  logger.info(`Demo fixtures:\n${JSON.stringify(summary, null, 2)}`);

  const generated = accounts.filter(
    ([, account]) => account.created && account.password_generated
  );
  if (generated.length) {
    // Print generated passwords to stdout only, not to the application logger.
    process.stdout.write(
      "Generated demo passwords. Store them privately; they are not shown again:\n" +
        generated
          .map(
            ([key, account]) =>
              `  ${PASSWORD_ENV[key]} (${account.email}): ${account.password}`
          )
          .join("\n") +
        "\n"
    );
  }
}
