FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.3.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY apps/memory/package.json apps/memory/package.json
COPY apps/worker/package.json apps/worker/package.json
ARG COMPASS_NPM_REGISTRY=https://registry.npmjs.org/
RUN --mount=type=cache,id=compass-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store --fetch-timeout=300000 --network-concurrency=8 --registry=${COMPASS_NPM_REGISTRY}
COPY apps/web apps/web
# Contracts are checked and generated before building images; no Python runtime in Web.
RUN pnpm --filter @compass/web build

FROM build AS database-tools
USER node
CMD ["node", "apps/web/scripts/db-setup.mjs"]

FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
