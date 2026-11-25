FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 HOME_STANDALONE=1
RUN npm install --global pnpm@11.3.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/home/package.json apps/home/package.json
ARG COMPASS_NPM_REGISTRY=https://registry.npmjs.org/
RUN --mount=type=cache,id=compass-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store --fetch-timeout=300000 --network-concurrency=8 --registry=${COMPASS_NPM_REGISTRY}
# The deployment entry point prepares public assets from canonical sources before building.
COPY apps/home apps/home
RUN test -f apps/home/public/resources/system-schema.json && \
    test -f apps/home/public/prototype/index.html && \
    pnpm --filter @compass/home exec next build

FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3001
COPY --from=build --chown=node:node /app/apps/home/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/home/.next/static ./apps/home/.next/static
COPY --from=build --chown=node:node /app/apps/home/public ./apps/home/public
USER node
EXPOSE 3001
CMD ["node", "apps/home/server.js"]
