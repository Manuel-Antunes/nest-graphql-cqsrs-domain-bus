# syntax=docker/dockerfile:1
#
# Built from the workspace root, always — the context is the whole monorepo:
#   nx docker:build @nestposts/post-rememberer
#   docker build -f apps/post-rememberer/Dockerfile -t nestposts/post-rememberer:dev .
#   docker build -f apps/post-rememberer/Dockerfile --target dev -t post-rememberer-dev . && docker run --rm post-rememberer-dev pnpm nx test @nestposts/post-rememberer
#
# Stages, pnpm's and Nx's own features only:
#   base       node + the pnpm the root package.json pins
#   deps       the lockfile and every package.json, no source → the whole workspace installed ← one layer every image shares
#   dev        the full source on top → serve / test / lint
#   builder    nx build, with Nx's cache kept across image builds
#   prod-deps  the same manifests → pnpm install --prod, filtered to the root and this application
#   runner     the production node_modules and the build output, nothing else

ARG NODE_VERSION=24
ARG PNPM_VERSION=10.28.0
ARG PROJECT=@nestposts/post-rememberer
ARG PROJECT_DIR=apps/post-rememberer
ARG PORT=3001

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
ARG PORT
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps /repo ./
COPY --from=builder --chown=node:node /repo/${PROJECT_DIR}/dist ./${PROJECT_DIR}/dist
WORKDIR /repo/${PROJECT_DIR}
USER node
EXPOSE ${PORT}
CMD ["node", "dist/main.js"]
