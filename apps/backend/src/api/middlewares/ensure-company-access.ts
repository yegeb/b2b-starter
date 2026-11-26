import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";

/*
  Store company guards for customer-authenticated routes.

  A customer reaches only the company that their employee record belongs to.
  Another company fails with the same 404 as a missing company, so other actors
  cannot read, change, or detect it. Within their own company, only an employee
  with `is_admin` changes the company, its employees, or its approval settings.
*/

type ActorEmployee = { id: string; is_admin: boolean; company_id: string };

const companyNotFound = (id: string) =>
  new MedusaError(MedusaError.Types.NOT_FOUND, `Company id not found: ${id}`);

const notCompanyAdmin = () =>
  new MedusaError(
    MedusaError.Types.FORBIDDEN,
    "Only a company admin can perform this action"
  );

const getActorEmployee = async (
  req: AuthenticatedMedusaRequest
): Promise<ActorEmployee | undefined> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [customer],
  } = await query.graph({
    entity: "customer",
    fields: ["employee.id", "employee.is_admin", "employee.company_id"],
    filters: { id: req.auth_context.actor_id },
  });

  return (customer?.employee ?? undefined) as ActorEmployee | undefined;
};

const assertCompanyEmployee = (
  employee: ActorEmployee | undefined,
  companyId: string
): ActorEmployee => {
  if (!employee || employee.company_id !== companyId) {
    throw companyNotFound(companyId);
  }

  return employee;
};

const assertCompanyAdmin = (
  employee: ActorEmployee | undefined,
  companyId: string
) => {
  if (!assertCompanyEmployee(employee, companyId).is_admin) {
    throw notCompanyAdmin();
  }
};

/* Requires the actor to be an employee of the company in the `:id` parameter. */
export const ensureCompanyEmployee = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  assertCompanyEmployee(await getActorEmployee(req), req.params.id);
  next();
};

/* Requires the actor to be an admin employee of the company in `:id`. */
export const ensureCompanyAdmin = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  assertCompanyAdmin(await getActorEmployee(req), req.params.id);
  next();
};

/*
  Allows a company admin to add employees to the company in `:id`.

  Store sign-up creates a company and then adds the new customer as its first
  employee. Without an admin, that request is allowed only when the company has
  no employees, the actor has no company yet, and the actor adds themselves.
  Run this guard after `validateAndTransformBody`.
*/
export const ensureCompanyAdminOrFirstEmployee = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const { id } = req.params;
  const actorEmployee = await getActorEmployee(req);

  if (actorEmployee) {
    assertCompanyAdmin(actorEmployee, id);
    return next();
  }

  const { customer_id } = req.validatedBody as { customer_id: string };
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [company],
  } = await query.graph({
    entity: "company",
    fields: ["id", "employees.id"],
    filters: { id },
  });

  if (
    !company ||
    company.employees?.length ||
    customer_id !== req.auth_context.actor_id
  ) {
    throw companyNotFound(id);
  }

  next();
};

/*
  Requires the employee in the `:employeeId` parameter to belong to the company
  in `:id`. Run this guard after a company guard.
*/
export const ensureEmployeeInCompany = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { id, employeeId } = req.params;

  const {
    data: [employee],
  } = await query.graph({
    entity: "employee",
    fields: ["id"],
    filters: { id: employeeId, company_id: id },
  });

  if (!employee) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Employee id not found: ${employeeId}`
    );
  }

  next();
};

/* Requires the actor to be an admin employee of any company. */
export const ensureCompanyApprover = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const employee = await getActorEmployee(req);

  if (!employee?.is_admin) {
    throw notCompanyAdmin();
  }

  next();
};
