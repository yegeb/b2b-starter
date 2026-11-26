# Milestone 01 local demo fixture evidence

This record describes the isolated A2 demo created on 26 November 2026 for [issue 34](https://github.com/yegeb/b2b-starter/issues/34).
These IDs belong to that local database and are not portable to a new seed.
The database is separate from the HTTP integration test database.

## Seed and runtime

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

## Roles

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

## Fixture checks

The Store API created cart `cart_01M8BAF6H9SJ8R7BFGJCQSSTH1` and added one webcam for EUR 59.
The Store API returned `pp_system_default` for the region.
These checks establish catalog and provider availability.
They do not establish payment completion or the approval journey, which belong to A3.
