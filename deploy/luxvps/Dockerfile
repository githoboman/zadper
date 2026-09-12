# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.23.1
ARG PNPM_VERSION=11.3.0
ARG BUILD_REVISION=unknown

FROM node:${NODE_VERSION}-bookworm-slim AS pnpm-base

ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Keep dependency installation reproducible.  The application source is copied
# only after the lockfile has been installed so source-only changes do not
# invalidate this layer.
FROM pnpm-base AS dependencies

RUN mkdir -p \
      apps/cli \
      apps/mcp-server \
      apps/report-api \
      apps/web \
      packages/agent-pay-client \
      packages/agent-pay-core

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/cli/package.json apps/cli/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY apps/report-api/package.json apps/report-api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/agent-pay-client/package.json packages/agent-pay-client/package.json
COPY packages/agent-pay-core/package.json packages/agent-pay-core/package.json

RUN pnpm install --frozen-lockfile

FROM dependencies AS build

ARG BUILD_REVISION
LABEL org.opencontainers.image.revision=${BUILD_REVISION}

# Copy only the tracked source trees needed by the production builds.  In
# particular, this avoids sending a developer's root `.env`, key material, or
# unrelated build output to the daemon when the repository has no root
# `.dockerignore`.
COPY apps ./apps
COPY packages ./packages
COPY docs/agents ./docs/agents
COPY contracts/agent-pay-registry/scripts ./contracts/agent-pay-registry/scripts
# Copy only the two files needed by the image targets.  Do not send the host
# Compose env, key directory, binary directory, or snapshots into the daemon
# when this repository is used as a build context.
COPY deploy/luxvps/facilitator-entrypoint.sh ./deploy/luxvps/facilitator-entrypoint.sh
COPY deploy/luxvps/nginx-web.conf ./deploy/luxvps/nginx-web.conf
COPY LICENSE ./LICENSE

RUN pnpm --filter @agent-pay/core build \
    && pnpm --filter @agent-pay/client build \
    && pnpm --filter @agent-pay/cli build \
    && pnpm --filter @agent-pay/report-api build \
    && pnpm --filter @agent-pay/mcp-server build \
    && pnpm --filter @agent-pay/web build \
    # Preserve the workspace link farms before pruning.  pnpm prune removes
    # them; the runtime image still needs the links for production imports.
    && mkdir -p /tmp/runtime-node-modules \
    && cp -a apps/mcp-server/node_modules /tmp/runtime-node-modules/mcp-server \
    && cp -a apps/report-api/node_modules /tmp/runtime-node-modules/report-api \
    && cp -a packages/agent-pay-client/node_modules /tmp/runtime-node-modules/agent-pay-client \
    && cp -a packages/agent-pay-core/node_modules /tmp/runtime-node-modules/agent-pay-core \
    && CI=true pnpm prune --prod

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ARG BUILD_REVISION
ARG RUNTIME_UID=10001
ARG RUNTIME_GID=10001

LABEL org.opencontainers.image.title="AgentPay runtime" \
      org.opencontainers.image.revision=${BUILD_REVISION} \
      org.opencontainers.image.source="https://github.com/Timidan/agentpay-trust-pass"

RUN apt-get update \
    && apt-get install --yes --no-install-recommends bash ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid ${RUNTIME_GID} agentpay \
    && useradd --system --uid ${RUNTIME_UID} --gid ${RUNTIME_GID} \
         --home-dir /nonexistent --shell /usr/sbin/nologin agentpay

ENV NODE_ENV=production
WORKDIR /app

# pnpm keeps workspace packages as symlinks.  The corresponding package roots
# and production dist trees are copied at the same paths so those symlinks stay
# valid in the runtime image.
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/package.json ./package.json
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/node_modules ./node_modules
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/docs/agents ./docs/agents
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /tmp/runtime-node-modules/mcp-server ./apps/mcp-server/node_modules
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/apps/mcp-server/package.json ./apps/mcp-server/package.json
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/apps/mcp-server/dist ./apps/mcp-server/dist
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /tmp/runtime-node-modules/report-api ./apps/report-api/node_modules
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/apps/report-api/package.json ./apps/report-api/package.json
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/apps/report-api/dist ./apps/report-api/dist
# Verdict-card fonts. This image has no font packages, so the card renderer
# reads these files instead of a host font database.
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/apps/report-api/assets ./apps/report-api/assets
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /tmp/runtime-node-modules/agent-pay-client ./packages/agent-pay-client/node_modules
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/packages/agent-pay-client/package.json ./packages/agent-pay-client/package.json
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/packages/agent-pay-client/dist ./packages/agent-pay-client/dist
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /tmp/runtime-node-modules/agent-pay-core ./packages/agent-pay-core/node_modules
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/packages/agent-pay-core/package.json ./packages/agent-pay-core/package.json
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/packages/agent-pay-core/dist ./packages/agent-pay-core/dist
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/contracts/agent-pay-registry/scripts ./contracts/agent-pay-registry/scripts
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /app/deploy/luxvps/facilitator-entrypoint.sh /usr/local/bin/facilitator-entrypoint.sh

RUN chmod 0555 /usr/local/bin/facilitator-entrypoint.sh \
    && chmod 0555 /app/contracts/agent-pay-registry/scripts/*.sh

USER agentpay
ENTRYPOINT ["node"]

FROM nginx:1.27-alpine AS web

ARG BUILD_REVISION

LABEL org.opencontainers.image.title="AgentPay web" \
      org.opencontainers.image.revision=${BUILD_REVISION} \
      org.opencontainers.image.source="https://github.com/Timidan/agentpay-trust-pass"

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/luxvps/nginx-web.conf /etc/nginx/conf.d/default.conf
