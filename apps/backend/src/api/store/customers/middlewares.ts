import { authenticate, validateAndTransformQuery } from "@medusajs/framework";
import { MiddlewareRoute } from "@medusajs/medusa";
import { StoreGetCustomerApprovals } from "./me/approvals/validators";

export const storeCustomersMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/store/customers/me/approvals",
    middlewares: [
      authenticate("customer", ["session", "bearer"]),
      validateAndTransformQuery(StoreGetCustomerApprovals, {
        defaults: ["id"],
        isList: true,
      }),
    ],
  },
];
