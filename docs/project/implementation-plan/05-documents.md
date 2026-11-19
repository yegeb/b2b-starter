# 05 · Quote snapshots, PDF function and download

**Assignment.** Backend owns snapshot and access decisions. Frontend owns buyer-visible state. Start with the quote trace, E2 and architecture §2.1. The PDF must reflect what the merchant sent, even after the draft order changes.

**Proposed interface.** At merchant send, record an immutable reviewed snapshot with a revision, event ID and currency. Include buyer-visible descriptions, quantities, prices, tax, shipping and total from the same preview. Exclude internal notes. Keep one document per logical revision. The function receives the authorized snapshot and writes a deterministic private object. The API checks the requesting actor before serving bytes. This avoids requiring the function to connect to PostgreSQL.

**Observed at runtime, 19 November 2026.** The A3 merchant edit produced quantity 2, unit price 24 and total 48. The Store preview lacked a top-level currency code. Read currency from the same quote's draft order. Preserve decimal amounts in that currency's major units. Capture shipping, tax, discounts and the authoritative total from the reviewed order change. Verify an additional fixture with fractional prices and nonzero tax before freezing the schema. [Quote trace and build evidence](01-application.md)

**Proposed contract for Q1–Q4.** The order-change ID survives edits to its line actions. Add a monotonic edit version and return it with the merchant preview. Require every edit path, including the Admin SDK order-edit routes, to serialize with send for that draft. Send verifies the expected version while holding the same lock through snapshot and revision commit. Reject a stale version with 409 and prompt the merchant to review again. Race a price update against send. Accept only a PDF matching the acknowledged preview or a conflict with no publication intent. Store one snapshot hash with the revision. Write `quotes/<quote-id>/r<revision>.pdf` with `ifGenerationMatch=0`. On an existing object compare its snapshot hash before marking it ready. Retain a terminal error marker alongside the private object. Give only the authorized API read access for downloads. [Cloud Storage preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions)

| Authorized document request | Proposed API response | Fixture check |
| --- | --- | --- |
| Committed revision awaiting generation | 202 with revision and pending state | Bounded polling ends in ready or an explicit retry action. |
| Ready | 200 with PDF bytes, attachment disposition and private, no-store caching | Parse the bytes after another edit. The archived total remains 48 for the A3 snapshot. |
| Generation failed | Status resource returns a failed state and opaque reference | Keep provider diagnostics private. Display a recoverable buyer message. |
| Anonymous / unrelated actor or unknown revision | 401 / 404 respectively | Return no document metadata or bytes. |

Backend owns the open retention period with infrastructure and the team. Record a duration that covers the demo and the priced storage window. Gate deployed downloads on the role-correct buyer account screen in A3.

| ID · owner | Depends on | Task and acceptance evidence |
| --- | --- | --- |
| Q1 · Backend | A3, A4, E2 | Define which status transitions allow a send. Save the snapshot and publication intent consistently. Treat a repeated request for the same send as the same revision. Test a changed quantity/price and a retry. Compare the frozen fields with the merchant-visible preview. |
| Q2 · Backend | Q1, E4 | Implement the second-generation PDF function and create the private object once per revision. Use object-generation preconditions and validate metadata on replay. Parse the resulting PDF. Assert quote reference, currency, line quantities and total match the fixture. An older replay cannot overwrite a newer revision. |
| Q3 · Backend | Q1, Q2 | Add owner-scoped Store and merchant-authorized Admin document handlers. Use the recorded revision to select the object. Define pending, ready and failed states. Persist a terminal generation failure through a private status object observable by the API. Verify valid access, missing documents, wrong buyer and anonymous access, including direct object access. |
| Q4 · Frontend | Q3 | Add document state and download to buyer quote details and merchant quote details. Poll pending state with a bound. Test pending → ready, failure, and a reopened earlier revision. Compare the downloaded file with the fixture after the live draft changes. |
| Q5 · Infrastructure | G3, Q2, Q3, K3 | Deploy the quote-documents topic trigger and PDF function with a dedicated identity, zero minimum and two maximum instances. Use an authorized merchant send. Verify one private PDF per revision, parsed contents and authorized buyer download. Record function and object metadata against the event ID. |

**Handoff.** Record request and response examples for pending, ready, denied and failed cases. Document the private object key convention, permitted identities, versioning rule, size limit and retention. Give 09 timestamps for the original send and first authorized successful download. [Quote model](../../../apps/backend/src/modules/quote/models/quote.ts) · [Quote workflow](../../../apps/backend/src/workflows/quote/workflows/merchant-send-quote.ts) · [Storage preconditions](https://cloud.google.com/storage/docs/request-preconditions)
