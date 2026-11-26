import { createFindParams } from "@medusajs/medusa/api/utils/validators";
import { z } from "@medusajs/framework/zod";
import { ApprovalStatusType } from "../../../../../types/approval";

export type StoreGetCustomerApprovalsType = z.infer<
  typeof StoreGetCustomerApprovals
>;
export const StoreGetCustomerApprovals = createFindParams({
  limit: 20,
  offset: 0,
})
  .merge(
    z.object({
      status: z.nativeEnum(ApprovalStatusType).optional(),
    })
  )
  .strict();
