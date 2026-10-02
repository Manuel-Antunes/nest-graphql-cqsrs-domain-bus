# syntax=docker/dockerfile:1
#
# The posts agent for Amazon Bedrock AgentCore Runtime, built from what the host already built —
# the image's context is this project's directory, after `nx run @nestposts/posts-agent:prune`:
#   nx docker:build @nestposts/posts-agent
#   docker build --platform linux/arm64 -t nestposts/posts-agent:dev apps/posts-agent
#
# dist/main.js is the webpack bundle, which compiles every @nestposts/* library in, and
# dist/package.json with dist/pnpm-lock.yaml is what Nx's prune-lockfile cuts the workspace's
# lockfile down to: the packages the bundle requires and nothing else. So the image installs that
# and copies the bundle — 1.2 GB with Better Auth in it (its optional `next` peer is resolved as the
# workspace resolves it), where the workspace's dependencies make 1.6 GB against AgentCore's 2 GB
# limit, and with no `COPY --parents`, which Pulumi's docker-build cannot parse.
#
# arm64, the A2A contract on 0.0.0.0:9000, and DOCKER_CONTAINER set, because AgentCore creates no
# /.dockerenv and the AgentCore SDK reads one of the two to decide whether it runs in a container.

ARG NODE_VERSION=24
ARG PNPM_VERSION=10.28.0
ARG PORT=9000

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
    POSTS_AGENT_HOST=0.0.0.0 \
    POSTS_AGENT_PORT=${PORT}
WORKDIR /app
COPY --from=prod-deps /deploy/node_modules ./node_modules
COPY --chown=node:node dist/main.js ./dist/main.js
USER node
EXPOSE ${PORT}
CMD ["node", "dist/main.js"]
