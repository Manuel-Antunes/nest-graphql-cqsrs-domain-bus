# syntax=docker/dockerfile:1

FROM node:24-slim AS manifests
WORKDIR /src
COPY . .
RUN mkdir /manifests \
 && find . -name package.json -not -path '*/node_modules/*' -exec install -D {} /manifests/{} \; \
 && install -D pnpm-lock.yaml /manifests/pnpm-lock.yaml \
 && install -D pnpm-workspace.yaml /manifests/pnpm-workspace.yaml

FROM node:24-slim AS deps
RUN corepack enable
WORKDIR /workspace
COPY --from=manifests /manifests ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

FROM deps AS build
COPY . .
RUN pnpm exec nx build @nestposts/web

FROM node:24-slim AS runtime
RUN corepack enable
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build /workspace/package.json /workspace/pnpm-workspace.yaml /workspace/pnpm-lock.yaml ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/libs ./libs
COPY --from=build /workspace/apps/web ./apps/web
WORKDIR /workspace/apps/web
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "-p", "3000"]
