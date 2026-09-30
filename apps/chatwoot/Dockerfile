# pre-build stage
# Debian (glibc) node so its binary runs on the Debian ruby image below.
# (An Alpine/musl node binary will NOT run on a glibc base.)
FROM node:24-bookworm-slim as node
# Debian (glibc) base so Bundler installs PRECOMPILED native gems (grpc,
# google-protobuf, nokogiri, ffi, ...) instead of compiling them from source.
# On Alpine (musl) those gems have no precompiled variant, which forced
# `force_ruby_platform` and a multi-hour grpc/protobuf/abseil compile — made
# far worse under QEMU when cross-building the arm64 image on an amd64 runner.
FROM ruby:3.4.4-slim-bookworm AS pre-builder

ARG NODE_VERSION="24.13.0"
ARG PNPM_VERSION="10.2.0"
ENV NODE_VERSION=${NODE_VERSION}
ENV PNPM_VERSION=${PNPM_VERSION}

# ARG default to production settings
# For development docker-compose file overrides ARGS
ARG BUNDLE_WITHOUT="development:test"
ENV BUNDLE_WITHOUT ${BUNDLE_WITHOUT}
ENV BUNDLER_VERSION=2.5.16

ARG RAILS_SERVE_STATIC_FILES=true
ENV RAILS_SERVE_STATIC_FILES ${RAILS_SERVE_STATIC_FILES}

ARG RAILS_ENV=production
ENV RAILS_ENV ${RAILS_ENV}

# Heap ceiling for the Vite `assets:precompile` build. The dashboard bundle
# (~4700 modules, Tailwind v4) blows past 4 GB and OOMs ("Ineffective
# mark-compacts near heap limit"), made worse under QEMU when the arm64 image is
# cross-built on the amd64 self-hosted runner. 8192 fits the ~11.5 GB runner
# (qemu-user maps guest memory ~1:1, so host use ≈ heap + a few hundred MB).
# Overridable via the SST image build args if the runner RAM changes.
ARG NODE_OPTIONS="--max-old-space-size=8192 --openssl-legacy-provider"
ENV NODE_OPTIONS ${NODE_OPTIONS}

ENV BUNDLE_PATH="/gems"

# build-essential + libpq-dev cover the few gems that still compile (pg, bcrypt,
# bootsnap, puma, ...); the heavy ones (grpc/protobuf/nokogiri/ffi) come as
# precompiled aarch64-linux/x86_64-linux gems. libvips42 backs the ruby-vips
# FFI gem; ca-certificates is required for TLS (rubygems, S3, SES) on slim.
RUN apt-get update && apt-get install -y --no-install-recommends \
  openssl \
  ca-certificates \
  tar \
  xz-utils \
  build-essential \
  tzdata \
  libpq-dev \
  postgresql-client \
  libvips42 \
  git \
  curl \
  && mkdir -p /var/app \
  && rm -rf /var/lib/apt/lists/* \
  && gem install bundler -v "$BUNDLER_VERSION"

COPY --from=node /usr/local/bin/node /usr/local/bin/
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

RUN npm install -g pnpm@${PNPM_VERSION}

RUN echo 'export PNPM_HOME="/root/.local/share/pnpm"' >> /root/.shrc \
  && echo 'export PATH="$PNPM_HOME:$PATH"' >> /root/.shrc \
  && export PNPM_HOME="/root/.local/share/pnpm" \
  && export PATH="$PNPM_HOME:$PATH" \
  && pnpm --version

# Persist the environment variables in Docker
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# Build context is the project folder (see infra/aws/chatwoot.ts). Every gem the
# Gemfile names now comes from rubygems.org — `lighthouse-graphql` included,
# since it was extracted into its own repository — so nothing has to be vendored
# into the context. The Gemfile.lock copied here is the app-scoped one that
# `nx run chatwoot:prune` derives from the unified root lock.
COPY Gemfile Gemfile.lock ./

# On glibc, Bundler resolves the precompiled platform gems pinned in
# Gemfile.lock (aarch64-linux / x86_64-linux) — no `force_ruby_platform`, no
# grpc/protobuf source build. Do not install development or test gems in prod.
RUN if [ "$RAILS_ENV" = "production" ]; then \
  bundle config set without 'development test'; bundle install --jobs 4 --retry 3; \
  else bundle install --jobs 4 --retry 3; \
  fi

# .npmrc carries `node-linker=hoisted` so the standalone install reproduces the
# flat node_modules chatwoot's app code expects (direct imports of transitive
# deps like prosemirror-commands). It is copied alongside the manifest so it is
# in effect for `pnpm i` below.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm i

COPY . /app

# creating a log directory so that image wont fail when RAILS_LOG_TO_STDOUT is false
# https://github.com/chatwoot/chatwoot/issues/701
RUN mkdir -p /app/log

# generate production assets if production environment
RUN if [ "$RAILS_ENV" = "production" ]; then \
  SECRET_KEY_BASE=precompile_placeholder RAILS_LOG_TO_STDOUT=enabled bundle exec rake assets:precompile \
  && rm -rf spec node_modules tmp/cache; \
  fi

# Generate .git_sha file with current commit hash
RUN git rev-parse HEAD > /app/.git_sha || echo "unknown" > /app/.git_sha

# Remove unnecessary files
RUN rm -rf /gems/ruby/3.4.0/cache/*.gem \
  && find /gems/ruby/3.4.0/gems/ \( -name "*.c" -o -name "*.o" \) -delete \
  && rm -rf .git \
  && rm .gitignore

# final build stage
FROM ruby:3.4.4-slim-bookworm

ARG NODE_VERSION="24.13.0"
ARG PNPM_VERSION="10.2.0"
ENV NODE_VERSION=${NODE_VERSION}
ENV PNPM_VERSION=${PNPM_VERSION}

ARG BUNDLE_WITHOUT="development:test"
ENV BUNDLE_WITHOUT ${BUNDLE_WITHOUT}
ENV BUNDLER_VERSION=2.5.16

ARG EXECJS_RUNTIME="Disabled"
ENV EXECJS_RUNTIME ${EXECJS_RUNTIME}

ARG RAILS_SERVE_STATIC_FILES=true
ENV RAILS_SERVE_STATIC_FILES ${RAILS_SERVE_STATIC_FILES}

ARG RAILS_ENV=production
ENV RAILS_ENV ${RAILS_ENV}
ENV BUNDLE_PATH="/gems"

# build-essential kept so the entrypoint's `bundle check || bundle install`
# fallback can still build a gem if ever needed; libpq5/postgresql-client and
# libvips42 are the runtime shared libs the compiled pg / ruby-vips gems link
# against; ca-certificates for outbound TLS on slim.
RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  openssl \
  ca-certificates \
  tzdata \
  libpq-dev \
  postgresql-client \
  imagemagick \
  libvips42 \
  git \
  && rm -rf /var/lib/apt/lists/* \
  && gem install bundler -v "$BUNDLER_VERSION"

COPY --from=node /usr/local/bin/node /usr/local/bin/
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN if [ "$RAILS_ENV" != "production" ]; then \
  apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
  && npm install -g pnpm@${PNPM_VERSION} \
  && pnpm --version; \
  fi

COPY --from=pre-builder /gems/ /gems/
COPY --from=pre-builder /app /app

# Copy .git_sha file from pre-builder stage
COPY --from=pre-builder /app/.git_sha /app/.git_sha

WORKDIR /app

EXPOSE 3000
