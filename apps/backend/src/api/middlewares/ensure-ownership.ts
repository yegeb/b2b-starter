import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/*
  Store ownership guards for customer-authenticated routes.

  Each guard looks up the record only within the authenticated customer's scope.
  A record that another customer owns fails with the same 404 as a missing record,
  so other actors cannot read, change, or detect records that they do not own.
*/

const ensureCustomerOwns =
  (
    entity: "quote" | "cart",
    getId: (req: AuthenticatedMedusaRequest) => string
  ) =>
  async (
    req: AuthenticatedMedusaRequest,
    _res: MedusaResponse,
    next: MedusaNextFunction
  ) => {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

    await query.graph(
      {
        entity,
        fields: ["id"],
        filters: { id: getId(req), customer_id: req.auth_context.actor_id },
      },
      { throwIfKeyNotFound: true }
    );

    next();
  };

/* Requires the quote in the `:id` route parameter to belong to the customer. */
export const ensureCustomerOwnsQuote = ensureCustomerOwns(
  "quote",
  (req) => req.params.id
);

/* Requires the cart that `getCartId` selects to belong to the customer. */
export const ensureCustomerOwnsCart = (
  getCartId: (req: AuthenticatedMedusaRequest) => string
) => ensureCustomerOwns("cart", getCartId);
