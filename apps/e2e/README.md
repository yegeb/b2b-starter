# Browser regression tests

These Playwright tests drive the storefront and the Admin against a seeded backend.
They cover the role-specific account views, the buyer's own approval requests, the Admin quote details and the quote price override.

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
The script generates all passwords and secrets for each run.
Each run uses new fixture names, so you can run it again on the same database.

The HTML report is written to `apps/e2e/playwright-report`.

## Continuous integration

The `Backend HTTP and browser tests` job in the pull request checks runs these tests against a PostgreSQL service container.
