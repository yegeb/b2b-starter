# Local container preview

This demo runs a seeded Medusa store on one machine.
It uses a dedicated PostgreSQL container and does not connect to Google Cloud.
The backend uses in-memory coordination and the images include development dependencies.
They are for local inspection, not a production deployment.

Run these commands from the repository root with Docker Desktop or another Docker engine running.
The commands use ports 18000 and 19000 and create containers with the `b2b-preview-` prefix.
Use different names and ports if those are already in use.
The database is stored in the PostgreSQL container, so preserve that container while you need its data.

1. Create the isolated network and database.

```sh
docker network create b2b-preview-net
docker run -d --name b2b-preview-db --network b2b-preview-net \
  -e POSTGRES_USER=demo -e POSTGRES_PASSWORD=demo-local-only \
  -e POSTGRES_DB=medusa_demo postgres:16-alpine
docker exec b2b-preview-db pg_isready -U demo -d medusa_demo
```

If the readiness check fails while PostgreSQL starts, repeat it before the next step.
The password and other sample secrets below are for this isolated demo only.

2. Build the backend and initialize the demo database.

```sh
docker build --target backend -t b2b-preview-backend .
docker run --rm --network b2b-preview-net \
  -e 'DATABASE_URL=postgres://demo:demo-local-only@b2b-preview-db:5432/medusa_demo?sslmode=disable' \
  -e JWT_SECRET=local-demo-only-jwt -e COOKIE_SECRET=local-demo-only-cookie \
  b2b-preview-backend pnpm exec medusa db:migrate
docker run --rm --network b2b-preview-net \
  -e 'DATABASE_URL=postgres://demo:demo-local-only@b2b-preview-db:5432/medusa_demo?sslmode=disable' \
  -e JWT_SECRET=local-demo-only-jwt -e COOKIE_SECRET=local-demo-only-cookie \
  b2b-preview-backend pnpm exec medusa user -e admin@demo.local -p demo-admin-2026
```

The migration runs the initial seed, which creates eight products and a European region.
Run these commands only against the new demo database.
The `sslmode=disable` option applies to this local database, which does not support TLS.

3. Start the backend.

```sh
docker run -d --name b2b-preview-api --network b2b-preview-net \
  -p 127.0.0.1:19000:9000 \
  -e NODE_ENV=development \
  -e 'DATABASE_URL=postgres://demo:demo-local-only@b2b-preview-db:5432/medusa_demo?sslmode=disable' \
  -e JWT_SECRET=local-demo-only-jwt -e COOKIE_SECRET=local-demo-only-cookie \
  -e STORE_CORS=http://localhost:18000 -e ADMIN_CORS=http://localhost:19000 \
  -e AUTH_CORS=http://localhost:18000,http://localhost:19000 \
  b2b-preview-backend
```

Check `http://localhost:19000/health` before building the storefront.
The backend must be reachable while Next.js builds the product pages.
Development mode allows the admin session cookie over the local HTTP URL.

4. Read the generated publishable key and build the storefront.

For Docker Desktop, select the host gateway for the build.

```sh
preview_build_network=default
preview_build_backend=http://host.docker.internal:19000
```

For a local Linux Docker engine, select the host network instead.
This lets the build reach the API on host loopback without exposing the API externally.

```sh
preview_build_network=host
preview_build_backend=http://127.0.0.1:19000
```

Then build the storefront.

```sh
preview_key=$(docker exec b2b-preview-db psql -U demo -d medusa_demo -t -A \
  -c "SELECT token FROM api_key WHERE type = 'publishable' AND revoked_at IS NULL AND deleted_at IS NULL LIMIT 1")
test -n "$preview_key"
docker build --target storefront --network "$preview_build_network" \
  --build-arg MEDUSA_BACKEND_URL="$preview_build_backend" \
  --build-arg NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:19000 \
  --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY="$preview_key" \
  --build-arg NEXT_PUBLIC_DEFAULT_REGION=gb \
  --build-arg NEXT_PUBLIC_BASE_URL=http://localhost:18000 \
  -t b2b-preview-storefront .
```

Next.js embeds `NEXT_PUBLIC_*` values in the image during the build.
The publishable key is intended for browser use, but do not put private keys or secrets in build arguments.
Rebuild the image if the public backend URL, publishable key, or region changes.
The server-only `MEDUSA_BACKEND_URL` lets the container reach the API while the browser uses the public URL.

5. Start the storefront and inspect it.

```sh
docker run -d --name b2b-preview-storefront --network b2b-preview-net \
  -p 127.0.0.1:18000:8000 \
  -e MEDUSA_BACKEND_URL=http://b2b-preview-api:9000 \
  -e REVALIDATE_SECRET=local-demo-revalidation b2b-preview-storefront
```

Open `http://localhost:18000` for the store and `http://localhost:19000/app` for admin.
The demo admin login is `admin@demo.local` with password `demo-admin-2026`.
The backend and database are local demo instances with sample data.

To repeat the browser regression check, set `CHROME_PATH` to a Chrome or Chromium executable and run:

```sh
CHROME_PATH=/path/to/chrome node scripts/verify-local-preview.mjs
```

The check opens the seeded store in a temporary browser profile and checks that product search returns the sample catalog.
Set `PREVIEW_URL` if the storefront uses a different host or port.
