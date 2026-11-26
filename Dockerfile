# syntax=docker/dockerfile:1.7
FROM node:22.23.5-bookworm@sha256:e13726ca604184d7a91fcacab1fc09eefd642dc28e79ac34e85540dd93b78cfb AS dependencies
WORKDIR /workspace
RUN corepack enable
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json
RUN --mount=type=cache,id=b2b-pnpm-store,target=/pnpm/store pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile

FROM dependencies AS source
COPY . .

FROM source AS backend-build
RUN pnpm --filter @b2b-starter/backend build

FROM backend-build AS backend
ENV NODE_ENV=production
WORKDIR /workspace/apps/backend/.medusa/server
EXPOSE 9000
CMD ["pnpm", "start"]

FROM source AS storefront-build
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_DEFAULT_REGION=gb
ARG NEXT_PUBLIC_BASE_URL
ENV MEDUSA_BACKEND_URL=$MEDUSA_BACKEND_URL \
    NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY \
    NEXT_PUBLIC_DEFAULT_REGION=$NEXT_PUBLIC_DEFAULT_REGION \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
RUN pnpm --filter @b2b-starter/storefront build

FROM storefront-build AS storefront
ENV NODE_ENV=production
WORKDIR /workspace/apps/storefront
EXPOSE 8000
CMD ["pnpm", "start"]
