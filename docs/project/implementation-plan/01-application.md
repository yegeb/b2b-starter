# 01 · Application baseline

**Assignment.** Backend traces the business rules. Frontend traces the buyer and merchant actions. Start from the index revision and architecture §2.1. Deliver a capability matrix and a reproducible local baseline for sessions 02–06.

## First trace — request, send and view a quote

| Stage | Source observation | Implication |
| --- | --- | --- |
| Buyer requests | The confirmation component calls `createQuote`. The server action reads the cart cookie and auth headers and posts the cart ID. Store middleware authenticates the customer. The route takes the customer ID from the actor. [UI](../../../apps/storefront/src/modules/quotes/components/request-quote-confirmation/index.tsx) · [Server actions](../../../apps/storefront/src/lib/data/quotes.ts) · [Middleware](../../../apps/backend/src/api/store/quotes/middlewares.ts) · [Route](../../../apps/backend/src/api/store/quotes/route.ts) | **Reuse** the request. Verify cart ownership before creating a draft from the submitted cart. Resolved by A4 (#36, #90): `ensureCustomerOwnsCart` checks the submitted cart. |
| Medusa persists | The workflow reads items, currency, addresses and shipping. It creates a draft order, starts an order edit, and creates a quote linked to cart, customer, draft and order change. The model defaults to `pending_merchant`. [Workflow](../../../apps/backend/src/workflows/quote/workflows/create-request-for-quote.ts) · [Model](../../../apps/backend/src/modules/quote/models/quote.ts) | **Reuse** identifiers. Merchant edits can change prices and quantities. Capture the reviewed revision for a PDF. |
| Merchant sends | The Admin quote page calls the send mutation. The Admin route runs the send workflow. The workflow queries the quote ID and sets `pending_customer`. It contains no PDF snapshot, revision counter or publication step. [Admin page](../../../apps/backend/src/admin/routes/quotes/%5BquoteId%5D/page.tsx) · [Route](../../../apps/backend/src/api/admin/quotes/%5Bid%5D/send/route.ts) · [Workflow](../../../apps/backend/src/workflows/quote/workflows/merchant-send-quote.ts) | **Change** the send transition to record a stable revision and durable publication intent. Define repeat-send semantics in 03 and 05. |
| Buyer views | The account detail page fetches the quote and its order preview. The detail route scopes the query to the customer. The preview handler queries the quote by ID and calls the order module for the current preview. [Account page](../../../apps/storefront/src/app/%5BcountryCode%5D/(main)/account/@dashboard/quotes/details/%5Bid%5D/page.tsx) · [Detail route](../../../apps/backend/src/api/store/quotes/%5Bid%5D/route.ts) · [Preview route](../../../apps/backend/src/api/store/quotes/%5Bid%5D/preview/route.ts) | **Change** the preview lookup to use the same ownership scope. **Add** PDF state and authorized download. Trace ownership on all related actions before public deployment. Resolved by A4 (#36, #90): `ensureCustomerOwnsQuote` scopes detail, preview, messages, accept and reject. |

## Other capabilities

| Capability | Existing evidence | Work to classify or verify |
| --- | --- | --- |
| Sign-in and browse | The storefront uses customer email/password login. Catalog pages use the SDK, region, publishable key, and product data. [Customer actions](../../../apps/storefront/src/lib/data/customer.ts) · [Product page](../../../apps/storefront/src/app/%5BcountryCode%5D/(main)/products/%5Bhandle%5D/page.tsx) | **Configure** public URLs, CORS, keys, cookies and a seeded country. Verify authenticated and anonymous views across replicas. |
| Cart and approval | The cart approval route creates a pending approval. The workflow links approval and status to the cart. Store moderation requires a company-admin role. Checkout validates pending approval and spending limits. [Approval route](../../../apps/backend/src/api/store/carts/%5Bid%5D/approvals/route.ts) · [Middleware](../../../apps/backend/src/api/store/approvals/middlewares.ts) · [Checkout hook](../../../apps/backend/src/workflows/hooks/validate-cart-completion.ts) | **Reuse** commerce rules. Trace same-company scope from buyer to eligible approver. **Add** notification after successful creation. |
| Order completion | The storefront calls cart completion. The order-created hook links the order to its company when the metadata contains a company ID. [Cart actions](../../../apps/storefront/src/lib/data/cart.ts) · [Order hook](../../../apps/backend/src/workflows/hooks/order-created.ts) | **Reuse** completion and linking. Select the final order-placement signal for notification. Quote creation also creates a draft order. |
| Catalog media | The seed uses upstream S3 image URLs. The backend also tracks static assets. The storefront config lists permitted image hosts. [Seed](../../../apps/backend/src/migration-scripts/initial-data-seed.ts) · [Assets](../../../apps/backend/static) · [Next config](../../../apps/storefront/next.config.js) | **Reuse** existing URLs. **Add** an upload and publication path for new merchant images. |
| Build and test | Next config checks for a publishable key. Static parameter generation visits the API. The product path catches a fetch failure. Category generation also calls the region and category helpers. Existing HTTP suites cover companies, store quotes and Admin quote messages. [Build check](../../../apps/storefront/check-env-variables.js) · [Category page](../../../apps/storefront/src/app/%5BcountryCode%5D/(main)/categories/%5B...category%5D/page.tsx) · [HTTP suites](../../../apps/backend/integration-tests/http) | **Verify** the build with the intended release inputs. Add behavioral coverage for the merchant send and buyer view sequence. |

## Local baseline and handoff

### Local verification on 19 November 2026

**Observed at runtime.** A disposable source archive of roadmap commit `710ed479` contained the same application, lockfile and manifests as `fc5f49ab`. The checks used macOS arm64, official Node 22.23.4, pnpm 9.15.0 and a fresh PostgreSQL 18.0 instance. The manifest resolves Medusa 2.22.7 and Next.js 16.3.8. The shell's default Node was 22.17.0. The bundled Node 24.14.0 could install dependencies but macOS library validation rejected SWC. Use the official Node binary for reproduction. [Root manifest](../../../package.json) · [Backend](../../../apps/backend/package.json) · [Storefront](../../../apps/storefront/package.json)

| Check | Procedure on the disposable fixture | Result |
| --- | --- | --- |
| A1 installation and original suites | Run `pnpm install --frozen-lockfile`, then `pnpm test:integration:http`. In the backend test environment set `DB_HOST=localhost`, the disposable `DB_PORT`, `DB_USERNAME` and `DB_PASSWORD`. Reserve a role with database-creation rights on that instance. | Frozen install succeeded. Store quotes, Admin quote messages and companies all failed to load the static `scrypt-kdf` import in the Admin fixture. Three suite failures, zero executed tests. Source contains 7 + 1 + 7 cases respectively. The original import failure precedes database setup. [Test helper](../../../apps/backend/integration-tests/utils/admin.ts) · [Jest config](../../../apps/backend/jest.config.js) |
| A2 database and roles | Set the backend `DATABASE_URL` to a separate empty demo DB. Set JWT and cookie secrets and local Store/Admin/auth CORS. In `apps/backend`, run `pnpm exec medusa db:migrate`, then create a merchant with the Medusa user CLI. Run `pnpm exec medusa develop -H 127.0.0.1 -p 19083`. | Migration and store seed completed. Eight product IDs, one channel ID and one publishable-key ID survived a second migration unchanged. Set the storefront's public key privately. Use country `dk`, region currency EUR, variant `WEBCAM-BLACK` and system payment. The variant has inventory management disabled. |
| A3 quote, Store and Admin HTTP | Register two companies and three synthetic customer accounts. Through Admin, link an ordinary buyer and an admin employee to company A, and a second buyer/admin to B. As buyer A, create a DK cart with the company ID and one webcam. Request a quote. As merchant, edit its original draft line and send. Fetch detail and preview as the same buyer. | Quote `quo_01M7TF8ZS1VNYWSNMZFYSGRMPV`, draft `order_01M7TF8ZP5DNEQ2H1FXBX6GFXF`. Status advanced from `pending_merchant` to `pending_customer`. Unit price changed from 59 to 24. The preview returned quantity 2 and total 48. Read currency from the linked draft order. The preview lacked a top-level currency code. |
| A3 approval and checkout, HTTP | Enable admin approval alone for company A. Create a second buyer cart linked to A. Request approval. Sign in as A's admin employee, list pending requests and approve. Add the available shipping method and a `pp_system_default` payment session. Complete the cart. | Approval `appr_01M7TF902BFN2ZJFRQGWNSHE91` changed from pending to approved. The approver saw one cart. Completion returned order `order_01M7TF90EMCNRX7P3DVWTBSA44` with total 69. No external payment or email service participated. |
| A3 browser, built shop and local Admin | Sign in as a non-admin employee. Use a prepared cart, choose **Request Quote**, then **Submit**. In a separate merchant session, open the resulting quote, choose **Send Quote** and confirm. Open buyer details again. | The shop navigated to quote `quo_01M7TFE8JDXGXA8SP9R5PAFYDH`. Admin confirmed the send. The buyer detail screen rendered its error boundary. The account layout calls the admin-only pending approvals list for every customer. Medusa returned 403. The 26 November verification below closes browser acceptance. [Account layout](../../../apps/storefront/src/modules/account/templates/account-layout.tsx) · [Order history](../../../apps/storefront/src/app/%5BcountryCode%5D/(main)/account/@dashboard/orders/page.tsx) |
| A5 production build | Set `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` and `NEXT_PUBLIC_DEFAULT_REGION=dk` in the storefront build environment. Run the package build with an unreachable API, then the seeded API and channel key. Run root `pnpm build` with the seeded API. | Offline collection page data failed after compilation. Online Next generated 106/106 pages. Root build completed both tasks uncached. Outputs included `apps/storefront/.next` and `apps/backend/.medusa/server/public/admin/index.html`. The browser check used `next start`. The build skips storefront type checking. This row records the 19 November 2026 diagnostic run. The linked build evidence records the 25 November 2026 A5 acceptance runs: root `pnpm build --env-mode=loose --force` with the seeded API, and the same command in a separate container with the API unavailable, where Turbo stopped the parallel backend build. [Collection params](../../../apps/storefront/src/app/%5BcountryCode%5D/(main)/collections/%5Bhandle%5D/page.tsx) · [Build evidence](../a5-build-evidence.md) |

**A1 diagnostic, temporary copy only.** The 2.22.7 test package ships a Jest preset. Using it without VM modules reached 15 cases but failed on framework dynamic imports. A separate trial kept VM modules, loaded `scrypt-kdf` with native dynamic import in the fixture, and preserved dynamic imports in SWC. With `DB_HOST=localhost`, it reached all 15 cases. Seven Store quote cases failed during cart setup with HTTP 400. Admin quotes and the seven company cases failed with HTTP 401. The test loader selects SSL for a URL containing `127.0.0.1` and ordinary local connections for `localhost`. Use the latter with the private test port. A second trial published the product, encoded the password hash with `Buffer.from(hash).toString("base64")` and obtained the Admin bearer token through email/password login. Company and Admin quote suites passed. Six Store quote cases passed. The seventh expected an absent `summary.difference_sum`. The installed order module computes `accounting_total` and `credit_line_total`. For the 100-unit fixture, asserting 100 and 0 for these fields, while retaining the other amount checks, gave three passing suites and 15 passing cases. Command in the disposable backend was `DB_HOST=localhost pnpm test:integration:http`. Backend owns applying these changes and repeating the root command on the implementation branch. [Product fixture](../../../apps/backend/integration-tests/utils/seeder.ts) · [HTTP suites](../../../apps/backend/integration-tests/http)

**Decision.** Keep the Store approval-list permission. Gate the account layout and order history fetch on the signed-in employee's eligibility. Recheck buyer and approver views separately. Preserve company scoping in Medusa. The ordinary buyer must see the sent quote and the approver must retain their pending count.

**A3 repair trial.** In a disposable copy, the account layout fetched pending approvals only when `customer.employee.is_admin` was true. Rebuild the storefront with the seeded API and run it with `next start`. A browser session for the ordinary buyer reopened the merchant-sent quote and displayed **Pending Customer** and **Accept Quote**. This check covered quote detail. The orders page has its own approvals fetch. Verify that page and the approver's queue when applying the fix.

### A3 implementation verification on 26 November 2026

The isolated demo used PostgreSQL 16, Node 22.23.4, pnpm 9.15.0, and development servers from this worktree.
Before the fix, an ordinary employee signed in and the account page displayed a server error with `Forbidden`.
After the fix, the same buyer opened the account overview and orders page.
The buyer browsed eight products, added one `WEBCAM-BLACK` at EUR 59, and requested a quote in the storefront.
Quote `quo_01M8BBF9PJ65VWEGHB7S8SV794` initially showed `pending_merchant` and referenced draft order `order_01M8BBF9JVRAMFZCBPZNJRW3NK`.
The merchant changed the quantity to 2 and unit price to EUR 24 in Admin, then sent the quote.
The buyer reopened the detail page and saw `pending_customer`, quantity 2, unit price EUR 24, and total EUR 48.
The Admin quote page also showed a missing company name and `NaN` spending limit, tracked in [issue 89](https://github.com/yegeb/b2b-starter/issues/89).

A separate buyer cart requested admin approval through the Store API.
The company approver saw one pending request in the navigation and approval queue, then approved it in the storefront.
Approval `appr_01M8BBTSZKJ3MATFWRJ20GJQ0D` moved to approved, and the approver orders page loaded.
The buyer completed that cart through the Store API with a seeded shipping option and `pp_system_default`.
The response returned order `order_01M8BBXTWG9HCTRTYTVXYA9KBK` for EUR 69.
No external payment provider was used.

After a restart of the same fixture, the views were checked again in the browser.
The ordinary buyer's overview, orders and quote detail pages loaded without an error.
The buyer had no **Approvals** link and no **Pending Approvals** section.
The quote detail still showed `pending_customer`, quantity 2, unit price EUR 24 and total EUR 48.
A new cart requested admin approval as `appr_01M8BN1BSMP7S0DZCMEEVGHR21`.
The approver's navigation showed **Approvals 1**, and the orders and approvals pages listed the pending EUR 59 cart.

The Admin price override saved a wrong price after an edit of a grouped value.
Deleting one digit from `1,500` displayed `NaN` and saved EUR 1.00, tracked in [issue 96](https://github.com/yegeb/b2b-starter/issues/96).
The storefront type check reported five errors that also occurred on the base revision, tracked in [issue 97](https://github.com/yegeb/b2b-starter/issues/97).
The storefront had no test runner, tracked in [issue 98](https://github.com/yegeb/b2b-starter/issues/98).

### A3 follow-up fixes on 26 November 2026

`pnpm test` runs Vitest component tests in the storefront and the Admin extensions.
The tests replace the data layer with mocks that follow the Store and Admin API behavior.
Each test below failed on the code before its fix and passed after it.

| Issue | Change | Regression test |
| --- | --- | --- |
| [98](https://github.com/yegeb/b2b-starter/issues/98) | Add the storefront test runner. | An ordinary employee's account layout and orders page render without a call to the approval list. A company admin still gets the pending count and the **Pending Approvals** list. Before the role check, the buyer cases failed with `Forbidden`. |
| [101](https://github.com/yegeb/b2b-starter/issues/101) | Add `GET /store/customers/me/approvals`, which returns only the signed-in customer's carts with approval requests. The orders page lists an ordinary employee's own pending carts from it. | HTTP tests cover a buyer, a colleague, another company's employee, a company admin, the status filter and an anonymous request. Before the route existed, the four tests that call it failed with 404. The orders page test failed before the view existed. |
| [104](https://github.com/yegeb/b2b-starter/issues/104) | Show "Only company admins can review approval requests." on the approvals page for other employees, without loading the approval lists. | Before the fix, the page rendered the admin lists for an ordinary employee. In the browser, the lists returned 403 and the page showed a server error. |
| [89](https://github.com/yegeb/b2b-starter/issues/89) | Request `customer.employee.company` for the Admin quote page. Show `-` without an employee or company. | The page showed `$NaN` before the fix. It now shows the spending limit in the company currency and the company link. The test also fails if the page stops requesting the company. |
| [96](https://github.com/yegeb/b2b-starter/issues/96) | Store the unformatted price value. Send an update only for a valid changed price. | Before the fix, deleting one digit from `1,500` displayed `NaN`, and an unchanged field sent updates. The edit now saves 150. |
| [97](https://github.com/yegeb/b2b-starter/issues/97) | Fix nullable profile inputs and the cart drawer timer type. Declare `zod` as a peer of `@hookform/resolvers` 3 so that the storefront resolver uses the storefront's zod 3. | `tsc --noEmit` for the storefront exits zero. Pull request checks now run it. |

In the live demo, the Admin quote page for `quo_01M8BN5A97F8GH6NVYFTXBW042` showed EUR 1,000.00 and linked to the buyer's company.
On the same quote, deleting one digit from `1,500` displayed `150` and saved EUR 150.00.
Focusing and leaving the field without a change sent no update.
An ordinary buyer who opened `/dk/account/approvals` saw the not-available message, and the storefront sent no approvals request.
The company admin still saw the pending, approved and rejected lists.
The Admin type check has one error in `manage-items-section.tsx` that also occurs on the base revision, tracked in [issue 109](https://github.com/yegeb/b2b-starter/issues/109).

### A3 browser regression tests

`pnpm test:e2e` runs Playwright against a freshly migrated database, tracked in [issue 98](https://github.com/yegeb/b2b-starter/issues/98).
The script starts the backend and the storefront and creates synthetic fixtures through the APIs.
[The e2e README](../../../apps/e2e/README.md) describes the local command.
The pull request checks run the same command and the backend HTTP suites against a PostgreSQL service container.

| Scenario | Result after the fixes | Result on the base revision `0bfdb2c` |
| --- | --- | --- |
| An ordinary employee's account, orders and approvals pages | Pass. No **Approvals** link, only the buyer's own pending cart, and the not-available message on the approvals page. | Fail. The account page did not render after sign-in. |
| A company admin's navigation, approvals and orders pages | Pass. **Approvals 2**, both colleagues' carts listed, no cart from another company. | Pass. The admin view was not affected. |
| Admin quote details | Pass. The buyer email, `$1,000.00` in the company currency, and the company link. | Fail. `Spending Limit$NaN`. |
| Admin grouped price edit | Pass. `1,500` became `150` after one Backspace, and the line showed EUR 150.00. | Fail. The field showed `NaN`. |

| Actor | Intended scope for A4 | Acceptance fixture |
| --- | --- | --- |
| Visitor | Published catalog | Browse a seeded product. Private account actions require sign-in. |
| Buyer | Own cart, orders, quote details, preview, messages, transitions and PDF | Repeat the valid buyer journey. After implementing ownership checks, verify a different buyer cannot read or change its records. |
| Company approver | Admin-type approvals for that employee's company | Same-company moderation succeeds. Other company records stay private and unchanged. |
| Merchant | Admin-authenticated order edit, quote send and catalog changes | Check Admin confirmation, buyer-visible reviewed revision and one intent per send. |

**A4 ownership, implementation branch.**
Before the fix, the new suites ran against the unfixed routes.
In `integration-tests/http/quotes/ownership.spec.ts`, 5 of 11 tests failed.
A buyer of another company got a success response from `GET /store/quotes/:id/preview`, `POST /store/quotes/:id/messages`, `POST /store/quotes/:id/accept`, `POST /store/quotes/:id/reject`, and `POST /store/quotes` with buyer A's cart.
`GET /store/quotes/:id` already returned 404.
In `integration-tests/http/approvals/company-scope.spec.ts`, 2 of 6 tests failed.
A buyer of another company requested an approval on company A's cart, and an approver of company B approved and rejected company A's admin approval.
After the fix, root `pnpm test:integration:http` ran with Node 22.23.4, pnpm 9.15.0, a frozen lockfile, and a PostgreSQL 16 instance for this task only.
5 suites passed, 32 tests passed, 0 failed: `http/quotes/ownership.spec.ts` 11, `http/approvals/company-scope.spec.ts` 6, `http/quotes/quotes.spec.ts` 7, `http/companies/companies.spec.ts` 7, `http/admin/quotes/quotes.spec.ts` 1.
`http/quotes/quotes.spec.ts` is the existing quote journey: create, merchant send, accept, reject.
The browser buyer journey from A3 was not part of this check.
[Ownership middleware](../../../apps/backend/src/api/middlewares/ensure-ownership.ts) · [HTTP suites](../../../apps/backend/integration-tests/http)

| ID · owner | Prerequisite | Task and acceptance evidence |
| --- | --- | --- |
| A1 · Backend | Disposable local PostgreSQL, Node and pnpm matching the manifest | Run `pnpm install --frozen-lockfile`. Configure the HTTP runner for the disposable instance. Run `pnpm test:integration:http`. Record suite names, test counts and failures. Keep the integration database separate from the demonstration store. |
| A2 · Backend + frontend | A1, separate local demo DB | Apply migrations on the demo DB. Inspect the actual seed outputs. Set the storefront key and a country in its seeded region. Prepare two buyers, their companies, an eligible approver, merchant, saleable SKU and test payment method. Run `pnpm dev`. Record role labels and nonsecret fixture IDs. [A2 fixture evidence](../local-demo-a2.md). |
| A3 · Frontend | A2 | Repair the role-dependent account fetch. Sign in, browse, add an item, request a quote, edit and send it in Admin, then open buyer details. Record quote status, draft order reference, previewed quantity and price. Exercise approval and checkout separately. Save sanitized observations in this brief. |
| A4 · Backend | A2 | Align quote reads and mutations with actor ownership. Review cart ownership and approval company scope. Add focused authorization assertions for allowed actors and denied access. Verify the valid buyer journey still passes. |
| A5 · Frontend | A2 | Run `pnpm build` against the seeded API. Repeat with the API unavailable in an isolated build environment. Record which routes require live data and which defer rendering. Give 08 the tested build order, environment names and resulting artifact paths. |

**Exit evidence.** Attach the A1 test summary, A3 journey trace, the role/ownership matrix and A5 build outcomes. Identify any failure by stage. Record only the minimum required code changes.
