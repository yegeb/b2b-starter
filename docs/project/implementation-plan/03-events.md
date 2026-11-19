# 03 · Worker bridge and Pub/Sub

**Assignment.** Backend owns the bridge. Use A3, R1–R2 and architecture §2.1. Trace each business transition before choosing an event. Medusa's internal event bus connects API and worker. The worker publishes selected messages to the two GCP topics.

| Proposed topic | Producer boundary | Consumer and example payload fields |
| --- | --- | --- |
| `notifications` | A committed pending approval or placed non-draft order. Resolve recipients from authoritative records. | Notification function. Example: `{"version":1,"event_id":"approval-ap1-requested-r1","kind":"approval.requested","approval_id":"ap1","recipient":"approver@example.invalid"}` |
| `quote-documents` | An authorized merchant sends a reviewed revision. Capture the preview with that revision. | PDF function. Example: `{"version":1,"event_id":"quote-q1-sent-r1","kind":"quote.document.requested","quote_id":"q1","revision":1,"snapshot":{"currency":"EUR","lines":[{"label":"Sample","quantity":2,"amount":"24.00"}],"total":"24.00"}}` |

These examples are proposed contracts. Define money units, rounding, line amounts, tax and shipping consistently with the Medusa preview before freezing version 1. Define notification fan-out per recipient. Keep customer details out of resource names and logs. [Approval creation](../../../apps/backend/src/workflows/approval/workflows/create-approvals.ts) · [Merchant send](../../../apps/backend/src/workflows/quote/workflows/merchant-send-quote.ts) · [Pub/Sub delivery](https://docs.cloud.google.com/pubsub/docs/subscription-overview)

| ID | Depends on | Backend task and verification |
| --- | --- | --- |
| E1 | A3, R1 | Trace the committed approval, final order and merchant-send transitions. Record what happens on workflow compensation. Use sample fixtures to prove that a draft order made for a quote emits no order confirmation. |
| E2 | E1 | Design durable publication intent and stable business IDs. For custom transitions, persist the intent with the business change where a shared transaction is available. For framework-owned transitions, specify a recovery scan over committed records with a persisted unique key. Record the commit boundary and demonstrate recovery across each crash gap. |
| E3 | E2, R2 | Implement the worker publisher. Retry transient GCP errors with bounded backoff. Mark progress after publish acknowledgement. Reconcile pending records on restart. Replay an interrupted publish and verify both deliveries retain the same business ID. |
| E4 | E3 | Implement version and size validation, retry policy and terminal failure handling for each trigger. Record the supported retention/replay procedure for the chosen trigger type. Send malformed, duplicate and valid fixtures. Verify bounded failures and recovery of valid work. |

## Transition decisions

**Observed in source, 19 November 2026.** In the installed `@medusajs/core-flows@2.22.7/dist/cart/workflows/complete-cart.js`, completion emits `OrderWorkflowEvents.PLACED` with the order ID. Quote creation sets `is_draft_order: true`. Quote acceptance confirms the edit and sets that flag to false in a separate workflow. The custom approval step can create both Admin and sales-manager approvals. Its compensation deletes created approvals. [Request quote](../../../apps/backend/src/workflows/quote/workflows/create-request-for-quote.ts) · [Accept quote](../../../apps/backend/src/workflows/quote/workflows/customer-accept-quote.ts) · [Approval step](../../../apps/backend/src/workflows/approval/steps/create-approvals.ts)

**Decisions for E1–E3.** Use a completed-cart order for the first confirmation fixture. Qualify it by its committed cart/order link. Treat accepted quotes as a separate team decision on confirmation coverage. Use committed Admin-type pending approvals for company-approver notifications. Stage each eligible recipient once. For resend, the Admin UI offers send from `pending_merchant` or `customer_rejected`. Enforce the selected transitions in the backend. Allocate one revision per successful transition and return the same revision on a retry of that send. [Admin quote detail](../../../apps/backend/src/admin/routes/quotes/%5BquoteId%5D/page.tsx)

**Proposed persistence.** Own the revision, frozen payload and outbox row in the quote module. Write them and the status update in one module transaction. A unique constraint on quote and revision prevents duplicate intent. For core cart completion, reconcile committed order links using a stable order ID. Persist approval intent only for committed, linked records. Run reconciliation in the worker as well as on event receipt. Page the scan with an overlapping cursor and a unique business key. A new worker can resume after the last acknowledged page. Exercise compensation and the crash windows below before freezing the interface.

**Transport contract.** Use a versioned JSON envelope in Pub/Sub data. Decode `data.message.data` from the trigger's CloudEvent. Preserve the commerce event ID across republishes. Set an initial 128 KiB UTF-8 cap for the raw message, including the snapshot. Check encoded envelope size against Eventarc Standard's 512 KB maximum. Validate the size before completing merchant send. Persist failures and enable retries explicitly on the second-generation function trigger. Test the largest accepted payload and the first rejected payload. Record handling of oversized quotes in Q1. [Eventarc limits](https://docs.cloud.google.com/eventarc/docs/quotas) · [Function retry configuration](https://docs.cloud.google.com/run/docs/tips/function-retries)

| Failure point | Expected outcome to demonstrate |
| --- | --- |
| Commerce write rolls back | No notification or PDF for the failed transition. |
| Commerce commits while publisher is unavailable | An identifiable pending intent survives. The recovered worker publishes it. |
| Publish succeeds, worker stops before marking the row | The worker can republish. Consumers deduplicate using the business ID. |
| A consumer succeeds before delivery acknowledgement | Replay produces one logical document or one accepted delivery per recipient. |
| Permanent payload or provider error | Record a redacted reason and event ID. A reviewer can distinguish terminal failure from a retry. |

**Handoff.** Save versioned synthetic fixtures, the sequence of commits and acknowledgements, and the failure table with evidence. Give identical fixtures to 04 and 05. Functions receive sufficient inputs to run without private database access.
