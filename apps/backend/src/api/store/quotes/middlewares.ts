import {
  authenticate,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework";
import { MiddlewareRoute } from "@medusajs/medusa";
import {
  ensureCustomerOwnsCart,
  ensureCustomerOwnsQuote,
} from "../../middlewares/ensure-ownership";
import {
  listQuotesTransformQueryConfig,
  retrieveQuoteTransformQueryConfig,
} from "./query-config";
import {
  AcceptQuote,
  CreateQuote,
  CreateQuoteType,
  GetQuoteParams,
  RejectQuote,
  StoreCreateQuoteMessage,
} from "./validators";

export const storeQuotesMiddlewares: MiddlewareRoute[] = [
  {
    method: "ALL",
    matcher: "/store/quotes*",
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    method: ["GET"],
    matcher: "/store/quotes",
    middlewares: [
      validateAndTransformQuery(GetQuoteParams, listQuotesTransformQueryConfig),
    ],
  },
  {
    method: ["POST"],
    matcher: "/store/quotes",
    middlewares: [
      validateAndTransformBody(CreateQuote),
      ensureCustomerOwnsCart(
        (req) => (req.validatedBody as CreateQuoteType).cart_id
      ),
      validateAndTransformQuery(
        GetQuoteParams,
        retrieveQuoteTransformQueryConfig
      ),
    ],
  },
  {
    method: ["GET"],
    matcher: "/store/quotes/:id",
    middlewares: [
      ensureCustomerOwnsQuote,
      validateAndTransformQuery(
        GetQuoteParams,
        retrieveQuoteTransformQueryConfig
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/store/quotes/:id/accept",
    middlewares: [
      ensureCustomerOwnsQuote,
      validateAndTransformBody(AcceptQuote),
      validateAndTransformQuery(
        GetQuoteParams,
        retrieveQuoteTransformQueryConfig
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/store/quotes/:id/reject",
    middlewares: [
      ensureCustomerOwnsQuote,
      validateAndTransformBody(RejectQuote),
      validateAndTransformQuery(
        GetQuoteParams,
        retrieveQuoteTransformQueryConfig
      ),
    ],
  },
  {
    method: ["GET"],
    matcher: "/store/quotes/:id/preview",
    middlewares: [
      ensureCustomerOwnsQuote,
      validateAndTransformQuery(
        GetQuoteParams,
        retrieveQuoteTransformQueryConfig
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/store/quotes/:id/messages",
    middlewares: [
      ensureCustomerOwnsQuote,
      validateAndTransformBody(StoreCreateQuoteMessage),
      validateAndTransformQuery(
        GetQuoteParams,
        retrieveQuoteTransformQueryConfig
      ),
    ],
  },
];
