# 04 · Notification function and email

**Assignment.** Backend owns recipient selection and function behavior. Use E1–E4 and architecture §2.1. Deliver an approval request to the eligible company approver and an order confirmation to the buyer who placed the order.

**Proposed delivery choice.** Use a local capture transport for development and deterministic load tests. Use Resend test delivery for the deployed smoke test, subject to sender/account eligibility. A capture transport can verify rendering and routing locally. A provider test address can demonstrate provider acceptance and simulated delivery outcomes. Neither proves delivery to a real buyer inbox. Confirm the sender setup and any external charge before enabling the integration. [Provider test addresses](https://resend.com/docs/dashboard/emails/send-test-emails) · [Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)

| ID | Depends on | Backend task and verification |
| --- | --- | --- |
| N1 | E1 | Define each template and recipient rule from company membership, role and order ownership. Run synthetic cases for two companies, missing recipient and draft order. Record expected recipient count and template type. |
| N2 | E2, N1 | Implement the second-generation function with schema validation and an email adapter. Map synthetic recipients to test destinations in provider-test mode. Keep the logical recipient in the fixture for assertions. Supply `RESEND_API_KEY` through Secret Manager and configure the sender separately. Check rendered subject, content and intended recipient. |
| N3 | N2, E4 | Derive a stable send key per event and recipient. Persist a private delivery receipt. Simulate a timeout after provider acceptance. Retry with the same key within the provider's 24-hour window. Reconcile an ambiguous older send before retrying it. Check one accepted send, a redacted receipt and a distinct permanent-failure outcome. |
| N4 | N3, G1–G3 | Provision the Pub/Sub trigger and function identity. Set minimum instances to zero and maximum to two. Restrict receipt and secret access. Publish one synthetic approval event and one order event. Compare function logs, provider test activity and stored receipts using their correlation IDs. |

**Close the brief** with the selected provider, verified sender prerequisite, synthetic message examples, retry window, receipt location, and evidence that an unrelated company receives no notification. Give 09 a capture-mode fixture and a separate provider smoke-test count.
