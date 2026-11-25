# A5 build evidence

This record addresses [A5](https://github.com/yegeb/b2b-starter/issues/37) and informs [K1](https://github.com/yegeb/b2b-starter/issues/63) and [K4](https://github.com/yegeb/b2b-starter/issues/66).
It records a local experiment on 25 November 2026 against source commit `fc5f49ab`.
It does not prove a cloud release build or replace the remaining A2 fixture work.

## Setup and results

The experiment used separate disposable Linux containers for PostgreSQL, the API and each build.
PostgreSQL 16.16 contained a new database.
`medusa db:migrate` applied migrations and ran the repository seed.
A database query found eight active products and one publishable key.
The API health endpoint returned HTTP 200 before the online build.
The build containers used Node 22.23.5, pnpm 9.15.0 and the dependency image `nm-preview-151b-backend` with image ID `sha256:21e05a49ec48faf32214b6c300e5a12973bdd1f5f07fe2b1983bdbb9b43127e9`.
Its lockfile SHA-256 matched the checkout: `784901e63495472fcbd53df4a5998e3568b14bcae8102dafcf14007c25111dbc`.
The experiment overlaid the checkout archive on that image.
It removed build outputs and Turbo caches in each disposable build container.
The image came from the local preview work, so this was not a fresh dependency installation or a clean source image.
Extra files in the image outside the checkout may remain.
Repeat from a clean release image before deployment.

| Run | Command and API | Result |
| --- | --- | --- |
| Seeded | `pnpm build --env-mode=loose --force` with the seeded API reachable | Exit 0. Turbo reported two successful tasks and zero cache hits. Next generated 106 of 106 pages. |
| API unavailable | Same command in a separate container with the API URL at an unserved loopback port | Exit 1. Next compiled, then collection page data failed with `ECONNREFUSED`. Turbo stopped the parallel build before either task completed. |

The offline run kept the disposable database available to the backend build.
Only the configured API endpoint was unavailable.
The existing demo and its databases were not changed.
The logs for these runs are local task evidence at `/Users/byege/firstmate/data/cmpe48a-m01-builds/build-online.log` and `/Users/byege/firstmate/data/cmpe48a-m01-builds/build-offline.log`.
These paths are machine-specific and are not release artifacts.
The backend build reported 12 lint warnings and no lint errors.
The storefront build skipped TypeScript error validation because `next.config.js` sets `ignoreBuildErrors`.
A passing build therefore does not establish type safety.

## Live data and rendering

Collection parameter generation requests collections and regions.
The unavailable API caused `/[countryCode]/collections/[handle]` to fail while Next collected page data.
Category parameter generation also requests regions and categories, although the failed run did not isolate that route's failure.
Product parameter generation requests regions and products but catches errors and returns an empty parameter list.
That catch alone does not make the complete storefront build independent of the API.

The successful build classified the country home, contact, privacy, returns, shipping and terms pages as static.
It generated product paths as static HTML using `generateStaticParams`.
It classified account, cart, checkout, category, collection, order, search and store routes as dynamic.
Dynamic route classification does not imply that the build avoids their parameter-generation calls.
The product and static information pages specify 60-second revalidation.
The output also classified the middleware as a proxy and API routes such as payment return and UCP as dynamic.
These classifications describe this build and seed, not an availability guarantee at runtime.

## Handoff to the release build

The observed order was: migrate and seed a separate database, start the API, check its health, then run the root build.
Turbo started the backend and storefront tasks in parallel because the root build configuration has no dependency between them.
The already-running seeded API supplied storefront data during that build.
For a release, build the backend image and start a migrated, seeded API before building the storefront against it.
The exact release image and cloud network path still require verification under K1 and K4.

The storefront build used `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` and `NEXT_PUBLIC_DEFAULT_REGION`.
The first must be reachable from the build environment and appropriate for browser requests at runtime.
The key must belong to the seeded sales channel, and the default country must belong to a seeded region.
The experiment used `dk` and did not record the key value.
The backend used `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `STORE_CORS`, `ADMIN_CORS` and `AUTH_CORS`.
The disposable database URL used `sslmode=disable` on its isolated network because Medusa otherwise attempted SSL for the container hostname.
This is not a recommendation to disable TLS for a deployed database.
The experiment did not set a Redis URL, and Medusa reported an in-memory substitute.

The successful build produced `apps/storefront/.next/BUILD_ID` and `apps/backend/.medusa/server/public/admin/index.html` in its container.
The broader output directories are `apps/storefront/.next` and `apps/backend/.medusa/server`.
These paths are build outputs, not container image digests or deployed artifacts.
[Issue 91](https://github.com/yegeb/b2b-starter/issues/91) tracks repeatable online and unavailable API regression checks.
