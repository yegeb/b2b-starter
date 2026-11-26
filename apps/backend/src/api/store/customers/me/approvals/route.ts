import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { StoreGetCustomerApprovalsType } from "./validators";

/**
 * List the signed-in customer's own carts that have approval requests.
 *
 * Any customer may call this route. Unlike `GET /store/approvals`, which
 * lists the whole company's requests for company admins, it filters carts
 * by the authenticated customer and never returns another customer's carts.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest<StoreGetCustomerApprovalsType>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const customerId = req.auth_context.actor_id;
  const { status } = req.validatedQuery;
  const { skip = 0, take = 20 } = req.queryConfig.pagination ?? {};

  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "customer_id",
      "created_at",
      "updated_at",
      "completed_at",
      "approvals.*",
      "approval_status.*",
    ],
    filters: { customer_id: customerId },
  });

  const cartsWithApprovals = carts
    .filter(
      (cart) =>
        cart.customer_id === customerId &&
        (cart.approvals?.length ?? 0) > 0 &&
        (!status || cart.approval_status?.status === status)
    )
    .sort(
      (a, b) =>
        new Date(b.updated_at as Date).getTime() -
        new Date(a.updated_at as Date).getTime()
    );

  res.json({
    carts_with_approvals: cartsWithApprovals.slice(skip, skip + take),
    count: cartsWithApprovals.length,
    offset: skip,
    limit: take,
  });
};
