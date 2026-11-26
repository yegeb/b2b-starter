# Integration Tests

The `medusa-test-utils` package provides utility functions to create integration tests for your API routes and workflows.

For example:

```ts
import { medusaIntegrationTestRunner } from "medusa-test-utils"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Custom endpoints", () => {
      describe("GET /store/custom", () => {
        it("returns correct message", async () => {
          const response = await api.get(
            `/store/custom`
          )
  
          expect(response.status).toEqual(200)
          expect(response.data).toHaveProperty("message")
          expect(response.data.message).toEqual("Hello, World!")
        })
      })
    })
  }
})
```

Learn more in [this documentation](https://docs.medusajs.com/v2/debugging-and-testing/testing-tools/integration-tests).

## Running the HTTP suites

Use Node 22.23.4 or later and pnpm 9.15.0.
Install dependencies from the root with `pnpm install --frozen-lockfile`.
Run the tests against a disposable PostgreSQL instance separate from any demo or development database.
The runner creates, restores, and removes test databases on the configured instance.
The database role therefore needs permission to create databases.

Set `DB_HOST`, `DB_PORT`, `DB_USERNAME`, and `DB_PASSWORD` explicitly before running `pnpm test:integration:http` from the root.
The command fails if any of these values is missing.
For a local PostgreSQL instance without TLS, use `localhost` as `DB_HOST`.
The installed Medusa test runner enables TLS for other host strings.
Set `JWT_SECRET` and `COOKIE_SECRET` to test-only values if the suites need them.
Never use production or demo credentials for this command.

## A1 recorded run

The A1 run used Node 22.23.4, pnpm 9.15.0, a frozen lockfile, and a dedicated PostgreSQL 16 instance.
The final run passed all 15 tests with 0 failures: 7 store quotes, 7 companies, and 1 admin quote messages.

Before repairs, all three suites failed to load the ESM fixture.
After the loader and database configuration repairs, seven cart setup cases failed with HTTP 400 and eight admin-authenticated cases failed with HTTP 401.
After the fixture repairs, 14 tests passed and the quote summary assertion failed.
The final run passed after the assertion was updated.
See issue #33 for the recorded results.
