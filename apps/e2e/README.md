# Browser regression tests

These Playwright tests drive the storefront and the Admin against a seeded backend.
They cover the role-specific account views, the buyer's own approval requests, the Admin quote details and the quote price override.
They also cover the seeded catalog and its laptop filter, a bulk add of two product variants to the cart, and the Admin sign-in over local HTTP.

## Run the tests locally

Use Node 22.23.4 or later and pnpm 9.15.0.
Install dependencies from the repository root with `pnpm install --frozen-lockfile`.
Install the browser once with `pnpm --filter @b2b-starter/e2e exec playwright install chromium`.

Create an empty PostgreSQL database for the tests only.
Never use a shared, demo or development database: each run migrates the database and adds synthetic data.

```sh
E2E_DATABASE_URL=postgres://<user>:<password>@localhost:5432/<disposable-database> pnpm test:e2e
```

The command migrates and seeds the database, creates a synthetic Admin user, and starts the backend on port 9100.
It then creates synthetic companies, employees, carts with approval requests and a quote through the APIs.
Finally, it starts the storefront on port 8100 and runs Playwright.
Set `E2E_BACKEND_PORT` or `E2E_STOREFRONT_PORT` to use other ports.

The storefront server uses a separate backend URL, as a container does with an internal host name.
The browser uses the public backend URL on port 9100.
The storefront server uses `MEDUSA_BACKEND_URL` on the next port, 9101 by default, where a proxy forwards each request to the backend and records it.
The bulk cart test uses these records to check that server-side requests use `MEDUSA_BACKEND_URL` and that the browser never receives it.
The script generates all passwords and secrets for each run.
Each run uses new fixture names, so you can run it again on the same database.

The HTML report is written to `apps/e2e/playwright-report`.

The catalog test needs only a seeded storefront.
`scripts/verify-local-preview.mjs` runs it against the [local container preview](../../docs/local-container-preview.md).

## Continuous integration

The `Backend HTTP and browser tests` job in the pull request checks runs these tests against a PostgreSQL service container.
The same job also checks that `scripts/verify-local-preview.mjs` fails when no preview is running.
