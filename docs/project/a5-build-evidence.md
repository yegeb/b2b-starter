# A5 build evidence

This record addresses [A5](https://github.com/yegeb/b2b-starter/issues/37).
It records a local application test on 25 November 2026 against source commit `fc5f49ab`.
It describes local Docker builds only.
It does not prove a cloud release build or choose a cloud release path.
The [tentative cloud architecture](tentative-cloud-architecture.pdf) is not settled, and this record does not depend on it.

## Setup

The test used separate disposable Linux containers for PostgreSQL, the API and each build.
PostgreSQL 16.16 contained a new database.
`medusa db:migrate` applied migrations and ran the repository seed.
A database query found eight active products and one publishable key.
The API health endpoint returned HTTP 200 before the seeded build.

The build containers used Node 22.23.5, pnpm 9.15.0 and the local dependency image `nm-preview-151b-backend`.
Its image ID was `sha256:21e05a49ec48faf32214b6c300e5a12973bdd1f5f07fe2b1983bdbb9b43127e9`.
Its lockfile SHA-256 matched the checkout: `784901e63495472fcbd53df4a5998e3568b14bcae8102dafcf14007c25111dbc`.
The test overlaid the checkout archive on that image.
It removed build outputs and Turbo caches in each disposable build container.
The image came from the local preview work, so this was not a fresh dependency installation or a clean source image.
Extra files in the image outside the checkout may remain.

## Results

| Run | Command and API | Result |
| --- | --- | --- |
| Seeded API available | `pnpm build --env-mode=loose --force` with the seeded API reachable | Exit 0. Turbo reported two successful tasks and zero cache hits in 43 seconds. Next generated 106 of 106 pages. |
| API unavailable | Same command in a separate container with the API URL at an unserved loopback port | Exit 1. Next compiled, then failed to collect page data for `/[countryCode]/collections/[handle]` with `ECONNREFUSED`. Turbo reported zero successful tasks of two and stopped the parallel backend build. |

The API-unavailable run kept the disposable database available to the backend build.
Only the configured API endpoint was unavailable.
The existing demo and its databases were not changed.
The disposable containers and network were removed after the test.

The sanitized logs are local task evidence at `/Users/byege/firstmate/data/cmpe48a-m01-builds/build-online.log` and `/Users/byege/firstmate/data/cmpe48a-m01-builds/build-offline.log`.
These paths are machine-specific and are not release artifacts.
The relevant lines follow.

Seeded API available:

```text
@b2b-starter/storefront:build: ✓ Generating static pages using 9 workers (106/106) in 4.1s
@b2b-starter/backend:build: {"level":"info","message":"Backend build completed successfully (18.05s)",...}
@b2b-starter/backend:build: {"level":"info","message":"Frontend build completed successfully (37.51s)",...}
 Tasks:    2 successful, 2 total
Cached:    0 cached, 2 total
```

API unavailable:

```text
@b2b-starter/storefront:build:   Collecting page data using 9 workers ...
@b2b-starter/storefront:build: TypeError: fetch failed
@b2b-starter/storefront:build:   [cause]: Error: connect ECONNREFUSED 127.0.0.1:19083
@b2b-starter/storefront:build: Error: Failed to collect page data for /[countryCode]/collections/[handle]
 Tasks:    0 successful, 2 total
Failed:    @b2b-starter/storefront#build
```

The backend build reported 12 lint warnings and no lint errors in both runs.
The storefront build skipped TypeScript error validation because `next.config.js` sets `ignoreBuildErrors`.
A passing build therefore does not establish type safety.

## Route dependencies and rendering

Collection parameter generation requests collections and regions.
The unavailable API caused `/[countryCode]/collections/[handle]` to fail while Next collected page data.
Category parameter generation also requests regions and categories.
The failed run stopped at the collection route, so it did not isolate a category route failure.
Product parameter generation requests regions and products, but it catches errors and returns an empty parameter list.
That catch alone does not make the complete storefront build independent of the API.

The seeded build classified these routes as follows:

- Static: the country home, contact, privacy, returns, shipping and terms pages.
- Static HTML from `generateStaticParams`: the product paths.
- Dynamic: the account, cart, checkout, category, collection, order, search and store routes.
- Dynamic: the API routes, such as payment return and UCP.
- Proxy: the middleware.

Dynamic route classification does not imply that the build skips their parameter-generation calls.
The country home, product and static information pages specify 60-second revalidation.
These classifications describe this build and seed, not runtime availability.

## Local build order

The observed order was:

1. Migrate and seed a separate disposable database.
2. Start the API.
3. Check the API health endpoint.
4. Run the root build.

Turbo started the backend and storefront tasks in parallel because the root build configuration has no dependency between them.
The already-running seeded API supplied storefront data during the build.
The storefront build therefore requires a migrated, seeded and reachable API before it starts.
This record does not define the cloud release image, network path or deployment order.

## Environment names

The storefront build used these variables:

- `NEXT_PUBLIC_MEDUSA_BACKEND_URL`: the API URL. It must be reachable from the build environment.
- `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`: the key must belong to the seeded sales channel. The test did not record its value.
- `NEXT_PUBLIC_DEFAULT_REGION`: the country must belong to a seeded region. The test used `dk`.

The tested commit did not read `MEDUSA_BACKEND_URL`.
Later commits on `main` added it as an optional server-only API URL that takes precedence over `NEXT_PUBLIC_MEDUSA_BACKEND_URL` in server code.
This test did not exercise that variable.

The backend used `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `STORE_CORS`, `ADMIN_CORS` and `AUTH_CORS`.
The disposable database URL used `sslmode=disable` on its isolated network because Medusa otherwise attempted SSL for the container hostname.
This is not a recommendation to disable TLS for a deployed database.
The test did not set a Redis URL, and Medusa reported an in-memory substitute.

## Artifact paths

The seeded build produced `apps/storefront/.next/BUILD_ID` and `apps/backend/.medusa/server/public/admin/index.html` in its container.
The broader output directories are `apps/storefront/.next` and `apps/backend/.medusa/server`.
These paths are build outputs, not container image digests or deployed artifacts.

## Follow-up

[Issue 91](https://github.com/yegeb/b2b-starter/issues/91) tracks repeatable regression checks for builds with the seeded API available and unavailable.
