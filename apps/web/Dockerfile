# syntax=docker/dockerfile:1
#
# Built from the workspace root, always — the context is the whole monorepo:
#   nx docker:build @nestposts/web
#   docker build -f apps/web/Dockerfile -t nestposts/web:dev .
#   docker build -f apps/web/Dockerfile --target dev -t web-dev . && docker run --rm web-dev pnpm nx test @nestposts/web
#
# Stages, pnpm's and Nx's own features only:
#   base       node + the pnpm the root package.json pins
#   deps       the lockfile and every package.json, no source → the whole workspace installed ← one layer every image shares
#   dev        the full source on top → serve / test / lint
#   builder    nx build — codegen and next build — with Nx's cache kept across image builds
#   prod-deps  the same manifests → pnpm install --prod, filtered to the root and this application
#   runner     the production node_modules and what next start reads — .next, public, next.config.ts

ARG NODE_VERSION=24
ARG PNPM_VERSION=10.28.0
ARG PROJECT=@nestposts/web
ARG PROJECT_DIR=apps/web
ARG PORT=3000

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
CMD ["sh", "-c", "pnpm nx serve \"$PROJECT\""]

FROM dev AS builder
ARG PROJECT_DIR
RUN --mount=type=cache,id=nx-cache,target=/repo/.nx/cache \
    pnpm nx run "${PROJECT}:build" && rm -rf "${PROJECT_DIR}/.next/cache"

FROM base AS prod-deps
ARG PROJECT
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY --parents **/package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --filter='{.}' --filter="${PROJECT}..."

FROM node:${NODE_VERSION}-alpine AS runner
ARG PROJECT_DIR
ARG PORT
ENV NODE_ENV=production \
    PORT=${PORT}
WORKDIR /repo
COPY --from=prod-deps /repo ./
COPY --from=builder --chown=node:node /repo/${PROJECT_DIR}/.next ./${PROJECT_DIR}/.next
COPY --from=builder /repo/${PROJECT_DIR}/public ./${PROJECT_DIR}/public
COPY --from=builder /repo/${PROJECT_DIR}/next.config.ts ./${PROJECT_DIR}/
WORKDIR /repo/${PROJECT_DIR}
USER node
EXPOSE ${PORT}
CMD ["node", "node_modules/next/dist/bin/next", "start"]
