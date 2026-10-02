# syntax=docker/dockerfile:1
#
# Theo, the AG-UI agent, for Amazon Bedrock AgentCore Runtime — built, like the posts agent's image,
# from what the host already built: the image's context is this project's directory, after
# `nx run @nestposts/theo-agent:prune`:
#   nx docker:build @nestposts/theo-agent
#   docker build --platform linux/arm64 -t nestposts/theo-agent:dev apps/theo-agent
#
# dist/main.js is the webpack bundle, which compiles every @nestposts/* library in, and
# dist/package.json with dist/pnpm-lock.yaml is the workspace's lockfile cut down by Nx's
# prune-lockfile to the packages that bundle requires. apps/posts-agent/Dockerfile says why the
# image is built this way rather than from the workspace.
#
# arm64, the AG-UI contract on 0.0.0.0:8080 (POST /invocations streaming server-sent events, GET
# /ping), and DOCKER_CONTAINER set, because AgentCore creates no /.dockerenv.

ARG NODE_VERSION=24
ARG PNPM_VERSION=10.28.0
ARG PORT=8080

FROM node:${NODE_VERSION}-alpine AS prod-deps
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /deploy
COPY dist/package.json dist/pnpm-lock.yaml dist/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile

FROM node:${NODE_VERSION}-alpine AS runner
ARG PORT
ENV NODE_ENV=production \
    DOCKER_CONTAINER=1 \
    THEO_AGENT_HOST=0.0.0.0 \
    THEO_AGENT_PORT=${PORT}
WORKDIR /app
COPY --from=prod-deps /deploy/node_modules ./node_modules
COPY --chown=node:node dist/main.js ./dist/main.js
USER node
EXPOSE ${PORT}
CMD ["node", "dist/main.js"]
