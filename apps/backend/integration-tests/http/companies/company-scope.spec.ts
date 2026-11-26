import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  adminHeaders,
  createAdminUser,
  createStoreUser,
} from "../../utils/admin";
import { companySeeder, employeeSeeder } from "../../utils/seeder";
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../utils/store";

jest.setTimeout(60 * 1000);

const companyNotFound = (id: string) => ({
  type: "not_found",
  message: `Company id not found: ${id}`,
});

const employeeNotFound = (id: string) => ({
  type: "not_found",
  message: `Employee id not found: ${id}`,
});

const forbidden = {
  type: "forbidden",
  message: "Only a company admin can perform this action",
};

medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ api, getContainer }) => {
    let publishableKey,
      companyA,
      companyB,
      adminA,
      buyerA,
      adminB,
      newcomer,
      buyerAEmployee;

    const storeActor = async (email: string) => {
      const actor = await createStoreUser({
        api,
        storeHeaders: generateStoreHeaders({ publishableKey }),
        email,
      });
      const headers = generateStoreHeaders({ publishableKey });
      headers.headers["Authorization"] = `Bearer ${actor.token}`;
      return { customer: actor.customer, headers };
    };

    const denied = (request: Promise<unknown>) =>
      request.then(
        () => {
          throw new Error("Expected the request to be denied");
        },
        (e) => e.response
      );

    const readCompanyA = async () =>
      (await api.get(`/store/companies/${companyA.id}`, adminA.headers)).data
        .company;

    beforeEach(async () => {
      const container = getContainer();
      await createAdminUser(adminHeaders, container, api);
      publishableKey = await generatePublishableKey(container);

      adminA = await storeActor("admin@company-a.test");
      buyerA = await storeActor("buyer@company-a.test");
      adminB = await storeActor("admin@company-b.test");
      newcomer = await storeActor("newcomer@company-c.test");

      companyA = await companySeeder({
        api,
        adminHeaders,
        data: { name: "Company A", email: "a@company-a.test" },
      });
      companyB = await companySeeder({
        api,
        adminHeaders,
        data: { name: "Company B", email: "b@company-b.test" },
      });

      await employeeSeeder({
        api,
        adminHeaders,
        companyId: companyA.id,
        data: { customer_id: adminA.customer.id, is_admin: true },
      });
      buyerAEmployee = await employeeSeeder({
        api,
        adminHeaders,
        companyId: companyA.id,
        data: { customer_id: buyerA.customer.id, spending_limit: 100 },
      });
      await employeeSeeder({
        api,
        adminHeaders,
        companyId: companyB.id,
        data: { customer_id: adminB.customer.id, is_admin: true },
      });
    });

    describe("GET /store/companies/:id", () => {
      it("returns the company to its employee", async () => {
        const response = await api.get(
          `/store/companies/${companyA.id}`,
          buyerA.headers
        );

        expect(response.status).toEqual(200);
        expect(response.data.company).toEqual(
          expect.objectContaining({ id: companyA.id, name: "Company A" })
        );
      });

      it("returns 404 to another company's admin", async () => {
        const response = await denied(
          api.get(`/store/companies/${companyA.id}`, adminB.headers)
        );

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(companyNotFound(companyA.id));
      });
    });

    describe("POST /store/companies/:id", () => {
      it("lets the company admin update the company", async () => {
        const response = await api.post(
          `/store/companies/${companyA.id}`,
          { name: "Company A Renamed" },
          adminA.headers
        );

        expect(response.status).toEqual(200);
        expect(response.data.company.name).toEqual("Company A Renamed");
      });

      it("returns 403 to an employee who is not a company admin", async () => {
        const response = await denied(
          api.post(
            `/store/companies/${companyA.id}`,
            { name: "Renamed by buyer" },
            buyerA.headers
          )
        );

        expect(response.status).toEqual(403);
        expect(response.data).toEqual(forbidden);
        expect((await readCompanyA()).name).toEqual("Company A");
      });

      it("returns 404 to another company's admin and keeps the company unchanged", async () => {
        const response = await denied(
          api.post(
            `/store/companies/${companyA.id}`,
            { name: "Renamed by company B" },
            adminB.headers
          )
        );

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(companyNotFound(companyA.id));
        expect((await readCompanyA()).name).toEqual("Company A");
      });

      it("rejects a body id that targets another company", async () => {
        const response = await denied(
          api.post(
            `/store/companies/${companyB.id}`,
            { id: companyA.id, name: "Renamed through body id" },
            adminB.headers
          )
        );

        expect(response.status).toEqual(400);
        expect(response.data.type).toEqual("invalid_data");
        expect((await readCompanyA()).name).toEqual("Company A");
      });
    });

    describe("DELETE /store/companies/:id", () => {
      it("returns 404 to another company's admin and keeps the company", async () => {
        const response = await denied(
          api.delete(`/store/companies/${companyA.id}`, adminB.headers)
        );

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(companyNotFound(companyA.id));
        expect((await readCompanyA()).id).toEqual(companyA.id);
      });

      it("returns 403 to an employee who is not a company admin", async () => {
        const response = await denied(
          api.delete(`/store/companies/${companyA.id}`, buyerA.headers)
        );

        expect(response.status).toEqual(403);
        expect(response.data).toEqual(forbidden);
        expect((await readCompanyA()).id).toEqual(companyA.id);
      });

      it("lets the company admin delete the company", async () => {
        const response = await api.delete(
          `/store/companies/${companyA.id}`,
          adminA.headers
        );

        expect(response.status).toEqual(204);
      });
    });

    describe("GET /store/companies/:id/employees", () => {
      it("returns the employees to an employee of the company", async () => {
        const response = await api.get(
          `/store/companies/${companyA.id}/employees`,
          buyerA.headers
        );

        expect(response.status).toEqual(200);
        expect(response.data.employees).toHaveLength(2);
        expect(response.data.count).toEqual(2);
      });

      it("returns 404 to another company's admin", async () => {
        const response = await denied(
          api.get(`/store/companies/${companyA.id}/employees`, adminB.headers)
        );

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(companyNotFound(companyA.id));
      });
    });

    describe("POST /store/companies/:id/employees", () => {
      it("lets the company admin add an employee", async () => {
        const response = await api.post(
          `/store/companies/${companyA.id}/employees`,
          { customer_id: newcomer.customer.id },
          adminA.headers
        );

        expect(response.status).toEqual(200);
        expect(response.data.employee).toEqual(
          expect.objectContaining({ company_id: companyA.id })
        );
      });

      it("returns 403 to an employee who is not a company admin", async () => {
        const response = await denied(
          api.post(
            `/store/companies/${companyA.id}/employees`,
            { customer_id: newcomer.customer.id },
            buyerA.headers
          )
        );

        expect(response.status).toEqual(403);
        expect(response.data).toEqual(forbidden);
        expect((await readCompanyA()).employees).toHaveLength(2);
      });

      it("returns 404 to another company's admin and adds no employee", async () => {
        const response = await denied(
          api.post(
            `/store/companies/${companyA.id}/employees`,
            { customer_id: newcomer.customer.id, is_admin: true },
            adminB.headers
          )
        );

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(companyNotFound(companyA.id));
        expect((await readCompanyA()).employees).toHaveLength(2);
      });

      it("lets a customer without a company join a new company as its first admin", async () => {
        const {
          data: {
            companies: [company],
          },
        } = await api.post(
          "/store/companies",
          {
            name: "Company C",
            email: "c@company-c.test",
            currency_code: "usd",
          },
          newcomer.headers
        );

        const response = await api.post(
          `/store/companies/${company.id}/employees`,
          { customer_id: newcomer.customer.id, is_admin: true },
          newcomer.headers
        );

        expect(response.status).toEqual(200);
        expect(response.data.employee).toEqual(
          expect.objectContaining({ company_id: company.id, is_admin: true })
        );
      });

      it("does not let a customer add another customer to an empty company", async () => {
        const {
          data: {
            companies: [company],
          },
        } = await api.post(
          "/store/companies",
          {
            name: "Company C",
            email: "c@company-c.test",
            currency_code: "usd",
          },
          newcomer.headers
        );

        const response = await denied(
          api.post(
            `/store/companies/${company.id}/employees`,
            { customer_id: buyerA.customer.id, is_admin: true },
            newcomer.headers
          )
        );

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(companyNotFound(company.id));
      });

      it("does not let a customer join a company that already has employees", async () => {
        const response = await denied(
          api.post(
            `/store/companies/${companyA.id}/employees`,
            { customer_id: newcomer.customer.id, is_admin: true },
            newcomer.headers
          )
        );

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(companyNotFound(companyA.id));
        expect((await readCompanyA()).employees).toHaveLength(2);
      });
    });

    describe("GET /store/companies/:id/employees/:employeeId", () => {
      it("returns the employee to an employee of the company", async () => {
        const response = await api.get(
          `/store/companies/${companyA.id}/employees/${buyerAEmployee.id}`,
          buyerA.headers
        );

        expect(response.status).toEqual(200);
        expect(response.data.employee.id).toEqual(buyerAEmployee.id);
      });

      it("returns 404 to another company's admin", async () => {
        const response = await denied(
          api.get(
            `/store/companies/${companyA.id}/employees/${buyerAEmployee.id}`,
            adminB.headers
          )
        );

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(companyNotFound(companyA.id));
      });

      it("returns 404 for an employee of another company under the actor's own company", async () => {
        const response = await denied(
          api.get(
            `/store/companies/${companyB.id}/employees/${buyerAEmployee.id}`,
            adminB.headers
          )
        );

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(employeeNotFound(buyerAEmployee.id));
      });
    });

    describe("POST /store/companies/:id/employees/:employeeId", () => {
      it("lets the company admin update an employee", async () => {
        const response = await api.post(
          `/store/companies/${companyA.id}/employees/${buyerAEmployee.id}`,
          { spending_limit: 500 },
          adminA.headers
        );

        expect(response.status).toEqual(200);
        expect(response.data.employee.spending_limit).toEqual(500);
      });

      it("returns 404 to another company's admin and keeps the employee unchanged", async () => {
        for (const companyId of [companyA.id, companyB.id]) {
          const response = await denied(
            api.post(
              `/store/companies/${companyId}/employees/${buyerAEmployee.id}`,
              { spending_limit: 999999, is_admin: true },
              adminB.headers
            )
          );

          expect(response.status).toEqual(404);
        }

        const employee = (await readCompanyA()).employees.find(
          ({ id }) => id === buyerAEmployee.id
        );
        expect(employee).toEqual(
          expect.objectContaining({ spending_limit: 100, is_admin: false })
        );
      });
    });

    describe("DELETE /store/companies/:id/employees/:employeeId", () => {
      it("lets the company admin remove an employee", async () => {
        const response = await api.delete(
          `/store/companies/${companyA.id}/employees/${buyerAEmployee.id}`,
          adminA.headers
        );

        expect(response.status).toEqual(200);
        expect((await readCompanyA()).employees).toHaveLength(1);
      });

      it("returns 404 to another company's admin and keeps the employee", async () => {
        for (const companyId of [companyA.id, companyB.id]) {
          const response = await denied(
            api.delete(
              `/store/companies/${companyId}/employees/${buyerAEmployee.id}`,
              adminB.headers
            )
          );

          expect(response.status).toEqual(404);
        }

        expect((await readCompanyA()).employees).toHaveLength(2);
      });

      it("returns 403 to an employee who is not a company admin", async () => {
        const response = await denied(
          api.delete(
            `/store/companies/${companyA.id}/employees/${buyerAEmployee.id}`,
            buyerA.headers
          )
        );

        expect(response.status).toEqual(403);
        expect(response.data).toEqual(forbidden);
        expect((await readCompanyA()).employees).toHaveLength(2);
      });
    });

    describe("POST /store/companies/:id/approval-settings", () => {
      it("lets the company admin change the approval settings", async () => {
        const response = await api.post(
          `/store/companies/${companyA.id}/approval-settings`,
          { requires_admin_approval: true },
          adminA.headers
        );

        expect(response.status).toEqual(201);
        expect(
          (await readCompanyA()).approval_settings.requires_admin_approval
        ).toEqual(true);
      });

      it("returns 404 to another company's admin and keeps the settings unchanged", async () => {
        const response = await denied(
          api.post(
            `/store/companies/${companyA.id}/approval-settings`,
            { requires_admin_approval: true },
            adminB.headers
          )
        );

        expect(response.status).toEqual(404);
        expect(response.data).toEqual(companyNotFound(companyA.id));
        expect(
          (await readCompanyA()).approval_settings.requires_admin_approval
        ).toEqual(false);
      });

      it("returns 403 to an employee who is not a company admin", async () => {
        const response = await denied(
          api.post(
            `/store/companies/${companyA.id}/approval-settings`,
            { requires_admin_approval: true },
            buyerA.headers
          )
        );

        expect(response.status).toEqual(403);
        expect(response.data).toEqual(forbidden);
        expect(
          (await readCompanyA()).approval_settings.requires_admin_approval
        ).toEqual(false);
      });
    });
  },
});
