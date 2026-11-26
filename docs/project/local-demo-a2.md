# Milestone 01 local demo fixtures

This document explains how to create the A2 demo fixtures for [issue 34](https://github.com/yegeb/b2b-starter/issues/34).
It also records the isolated demo that was created on 26 November 2026.

## Create the fixtures

The script `apps/backend/src/scripts/demo-fixtures.ts` creates the business fixtures on a database that the initial data seed populated.
It uses the application workflows, so the hooks and links are the same as in the admin and store APIs.

| Role | Email | Company | Employee role |
| --- | --- | --- | --- |
| Buyer A | `buyer-a@example.test` | Demo Company A | Ordinary employee |
| Approver A | `approver-a@example.test` | Demo Company A | Company admin |
| Buyer B | `buyer-b@example.test` | Demo Company B | Company admin |
| Merchant | `merchant@example.test` | - | Admin dashboard user |

Demo Company A requires company admin approval and does not require sales manager approval.
Demo Company B requires no approval.
Each employee has a spending limit of 1000.

The script also makes sure that a storefront can sell `WEBCAM-BLACK` in Denmark.
It looks for a EUR region that contains `dk` and offers `pp_system_default`.
It also looks for a published `WEBCAM-BLACK` variant with a EUR 59 price and a publishable key for a sales channel of that product.
The script stops with an error if one of these records is missing.

To create the fixtures, do these steps:

1. Start a PostgreSQL database for the demo only.
   Do not use the HTTP integration test database or a shared database.
2. In `apps/backend/.env`, set `DATABASE_URL` to the demo database.
3. Optional: set `DEMO_MERCHANT_PASSWORD`, `DEMO_BUYER_A_PASSWORD`, `DEMO_APPROVER_A_PASSWORD`, and `DEMO_BUYER_B_PASSWORD`.
   Keep these values out of the repository.
4. From `apps/backend`, run `pnpm medusa db:migrate`.
   On an empty database, this command also runs the initial data seed.
5. From `apps/backend`, run `pnpm medusa exec ./src/scripts/demo-fixtures.ts`.
6. Record the IDs from the `Demo fixtures` summary.
7. If the script printed generated passwords, store them in a private location.
   The script shows each generated password one time only.

The script reuses the records that exist for these emails.
A second run does not change passwords.
It stops with an error if an existing employee has a different company or admin flag.

The summary includes the publishable key ID but not the key value.
To get the key value for `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, open **Settings > Publishable API Keys** in the admin dashboard.
Set `NEXT_PUBLIC_DEFAULT_REGION=dk` for the storefront.

## Automated test

The HTTP integration test `apps/backend/integration-tests/http/demo-fixtures/demo-fixtures.spec.ts` runs the initial data seed and the fixture script on a disposable test database.
It generates the passwords when it runs.
The test makes sure of these results:

- Each buyer and the approver sign in and belong to the expected company with the expected admin flag.
- The approver and Buyer B have the `company_admin` role, and Buyer A has no role.
- The merchant signs in to the admin API.
- The admin API shows the company members and the approval settings.
- Buyer A creates a Denmark cart with one `WEBCAM-BLACK` at EUR 59 and starts a `pp_system_default` payment session.
- A second run reuses the records and keeps the passwords.

To run the test, follow [Running the HTTP suites](../../apps/backend/integration-tests/http/README.md#running-the-http-suites).

## Recorded demo on 26 November 2026

The IDs in this section belong to one local database and are not portable to a new seed.
The fixtures in this record were created through the admin and store APIs before the fixture script existed.
Their emails and names are different from the emails and names that the script uses.
The database is separate from the HTTP integration test database.

### Seed and runtime

- PostgreSQL container: `cmpe48a-a2-fixtures-postgres`, database `a2demo`, localhost port `65510`.
- `pnpm exec medusa db:migrate` completed on the demo database and ran the initial seed.
- The seed produced eight published products.
- Region: `reg_01M8BABWF0ZCZRN9Q5VDS4VPTA`, Europe, EUR, country `dk`.
- The storefront process receives the seeded publishable key privately.
- Product: `prod_01M8BABWVJSDVQV5QY4CFSXWPN`.
  Variant: `variant_01M8BABWXHJEZTXXDXR04N4MXX`, SKU `WEBCAM-BLACK`.
  Inventory management is disabled for this variant.
- Payment provider: `pp_system_default`.
- `pnpm dev` runs the backend and storefront as separate filtered tasks on ports `19000` and `18000` because the default ports are occupied.
  The backend health endpoint and the Denmark storefront returned HTTP 200.

### Roles

| Role | Company ID | Customer ID | Employee or user ID |
| --- | --- | --- | --- |
| Buyer A, ordinary employee | `comp_01M8BAE7QN5MEM15HV0QCPHFCN` | `cus_01M8BAE7XRH45N48E19SYGWNKP` | `emp_01M8BAE7YK5DKXP53CHDC0XZBK` |
| Approver A, company admin | `comp_01M8BAE7QN5MEM15HV0QCPHFCN` | `cus_01M8BAE835P9SQ70HZA3N2Q656` | `emp_01M8BAE83Y7RR4QVWVC9EGSRW1` |
| Buyer B, company admin | `comp_01M8BAE7S5DBKR8WZC160P4684` | `cus_01M8BAE89240GR62ZES9RJ332B` | `emp_01M8BAE89SNY2EG4PKCS2XASAH` |
| Merchant | - | - | `user_01M8BACQCNJAPZBYAGST1Q2GAQ` |

Company A approval settings `apprset_01M8BAE7R38PDMCVKY84BN4T29` require admin approval and do not require sales manager approval.
Company B has both approval types disabled.
Request the private handoff location from the person who prepared the fixtures for [issue 34](https://github.com/yegeb/b2b-starter/issues/34).
The handoff contains synthetic sign-in details and operational logs outside the repository.
Request the storefront publishable key through the same private channel.

### Fixture checks

The Store API created cart `cart_01M8BAF6H9SJ8R7BFGJCQSSTH1` and added one webcam for EUR 59.
The Store API returned `pp_system_default` for the region.
These checks establish catalog and provider availability.
They do not establish payment completion or the approval journey, which belong to A3.
