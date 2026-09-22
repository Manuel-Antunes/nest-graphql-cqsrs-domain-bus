import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const monorepoRoot = path.resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The auth stack is left OUT of the server bundle, and loaded by Node instead.
 *
 * `@nestposts/auth` is compiled to CommonJS while MikroORM 7 and better-auth are ESM-only — the same
 * combination the Nest applications run, and one that works only through Node's own `require(esm)`.
 * Bundling it makes webpack resolve that interop itself, which it refuses ("ESM packages need to be
 * imported"), and which would in any case drop the `design:type` metadata MikroORM reads.
 *
 * `serverExternalPackages` is deliberately NOT used, and using it as well is what broke this: these
 * packages are ESM-only, so Next emits an `import()` for them while the CommonJS libraries that
 * depend on them emit a `require()`. Node refuses the second while the first is still evaluating —
 * `ERR_REQUIRE_ESM_RACE_CONDITION`, on every request. Matching the REQUEST here and returning
 * `commonjs` makes every reference a plain `require`, which loads them once, in order, exactly as
 * `apps/posts-api` does.
 *
 * It is also the only thing that works at all for the workspace packages: they resolve through a
 * symlink into `libs/`, so webpack sees a path outside `node_modules` and traces into it otherwise.
 */
const EXTERNAL_ON_THE_SERVER = [
  '@nestposts/auth',
  '@nestposts/organizations',
  '@nestposts/database',
  '@nestposts/users',
  '@nestposts/platform',
  '@nestposts/validated-dto',
  '@mikro-orm/core',
  '@mikro-orm/postgresql',
  'better-auth',
  'better-auth-mikro-orm',
  '@better-auth/oauth-provider',
  '@nestjs/common',
  '@nestjs/core',
  '@mikro-orm/nestjs',
];

const isExternal = (request: string): boolean =>
  EXTERNAL_ON_THE_SERVER.some((name) => request === name || request.startsWith(`${name}/`));

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      return config;
    }
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
      (
        { request }: { request?: string },
        callback: (error?: unknown, result?: string) => void,
      ) => (request && isExternal(request) ? callback(undefined, `commonjs ${request}`) : callback()),
    ];
    return config;
  },
};

export default nextConfig;
