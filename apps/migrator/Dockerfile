# syntax=docker/dockerfile:1
#
# Built from the workspace root, always — the context is the whole monorepo:
#   nx docker:build @nestposts/migrator
#   docker build -f apps/migrator/Dockerfile -t nestposts/migrator:dev .
#   docker build -f apps/migrator/Dockerfile --target dev -t migrator-dev . && docker run --rm migrator-dev pnpm nx test @nestposts/migrator
#
# Stages, pnpm's and Nx's own features only:
#   base       node + the pnpm the root package.json pins
#   deps       the lockfile and every package.json, no source → the whole workspace installed ← one layer every image shares
#   dev        the full source on top → serve / test / lint
#   builder    nx build, with Nx's cache kept across image builds
#   prod-deps  the same manifests → pnpm install --prod, filtered to the root and this application
#   runner     the production node_modules and the build output — the libraries' dist included, which
#              this tsc build requires at runtime — nothing else

ARG NODE_VERSION=24
ARG PNPM_VERSION=10.28.0
ARG PROJECT=@nestposts/migrator
ARG PROJECT_DIR=apps/migrator

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NX_DAEMON=false \
    NX_NO_CLOUD=true \
    CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY --parents **/package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS dev
COPY . .
ARG PROJECT
ENV PROJECT=${PROJECT}
CMD ["sh", "-c", "pnpm nx run \"$PROJECT:setup\""]

FROM dev AS builder
RUN --mount=type=cache,id=nx-cache,target=/repo/.nx/cache \
    pnpm nx run "${PROJECT}:build"

FROM base AS prod-deps
ARG PROJECT
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY --parents **/package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --filter='{.}' --filter="${PROJECT}..."

FROM node:${NODE_VERSION}-alpine AS runner
ARG PROJECT_DIR
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps /repo ./
COPY --from=builder --parents /repo/libs/*/dist /repo/libs/core/*/dist /
COPY --from=builder --chown=node:node /repo/${PROJECT_DIR}/dist ./${PROJECT_DIR}/dist
WORKDIR /repo/${PROJECT_DIR}
USER node
ENTRYPOINT ["node", "dist/main.js"]
CMD ["setup"]
