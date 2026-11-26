import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  authenticate,
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework";
import { MiddlewareRoute } from "@medusajs/medusa";
import { ensureRole } from "../../middlewares/ensure-role";
import { ApprovalType } from "../../../types/approval";
import { approvalTransformQueryConfig } from "./query-config";
import { StoreGetApprovals, StoreUpdateApproval } from "./validators";

/*
  Allows a company approver to moderate only admin-type approvals for carts of
  the approver's own company. An approval of another company fails with the same
  404 as a missing approval, so its existence and state stay private.
*/
const ensureApproverCanModerate = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const { id } = req.params;

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const [
    {
      data: [customer],
    },
    {
      data: [approval],
    },
  ] = await Promise.all([
    query.graph({
      entity: "customer",
      fields: ["employee.company.id"],
      filters: { id: req.auth_context.actor_id },
    }),
    query.graph({
      entity: "approval",
      fields: ["type", "cart.company.id"],
      filters: { id },
    }),
  ]);

  const approverCompanyId = customer?.employee?.company?.id;

  if (
    !approval ||
    !approverCompanyId ||
    approval.cart?.company?.id !== approverCompanyId
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Approval id not found: ${id}`
    );
  }

  const approvalType = approval.type as unknown as ApprovalType;

  if (approvalType !== ApprovalType.ADMIN) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  next();
};

export const storeApprovalsMiddlewares: MiddlewareRoute[] = [
  {
    method: "ALL",
    matcher: "/store/approvals*",
    middlewares: [
      authenticate("customer", ["session", "bearer"]),
      ensureRole("company_admin"),
    ],
  },
  {
    method: ["GET"],
    matcher: "/store/approvals",
    middlewares: [
      validateAndTransformQuery(
        StoreGetApprovals,
        approvalTransformQueryConfig
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/store/approvals/:id",
    middlewares: [
      ensureApproverCanModerate,
      validateAndTransformBody(StoreUpdateApproval),
    ],
  },
];
