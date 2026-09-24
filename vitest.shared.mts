import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import swc from 'unplugin-swc';
import type { ViteUserConfig } from 'vitest/config';
import { defineConfig } from 'vitest/config';

/**
 * The one Vitest configuration every project extends.
 *
 * SWC, and not Vite's esbuild: esbuild does not emit `emitDecoratorMetadata`, which Nest's dependency
 * injection reads. Vitest, and not Jest: MikroORM v7 and AutoMapper 9 are ESM-only and Jest cannot
 * `require()` ESM on Node 22.
 *
 * Under test, a workspace package resolves to its SOURCE — see {@link workspaceAliases}. It is not a
 * convenience: resolving to `dist` makes the same module exist twice in one run, once as the
 * CommonJS `tsc` emitted (reached by `require` from another package's `dist`) and once as the ESM SWC
 * produces (reached by `import` from the spec). Two copies of `delegate.ts` are two delegation
 * registries, two copies of a class are two prototypes, and the symptoms are a `.id` that comes back
 * `undefined` and MikroORM's "entity with this name was discovered, but not the prototype you are
 * passing". Aliased to source, the whole run is one module graph, transformed once, by SWC.
 */
export interface ProjectTestOptions {
  /** The project name, as it shows up in Vitest's output and in Nx. */
  name: string;
  include?: string[];
  env?: Record<string, string>;
  testTimeout?: number;
  coverageExclude?: string[];
  /**
   * Whether this project's specs talk to Postgres. It adds the global setup that reuses a server
   * already listening — `docker compose up -d postgres` — and starts a throwaway container when there
   * is none, publishing the result as `POSTGRES_URL`. A project of pure domain rules leaves it off and
   * needs no infrastructure at all.
   */
  database?: boolean;
}

/**
 * Every workspace package, aliased to its own sources.
 *
 * An alias and not the `@nestposts/source` export condition, which is what TypeScript uses: adding a
 * condition means declaring the whole list, and the list Vite resolves third-party packages with is
 * not ours to guess — dropping `require` from it is enough to make a dependency that ships broken ESM
 * (`@opentelemetry/semantic-conventions`, through MikroORM) fail to load. An alias touches nothing but
 * the packages in this repository.
 */
const workspaceAliases = (): { find: RegExp; replacement: string }[] => {
  const root = import.meta.dirname;
  const aliases: { find: RegExp; replacement: string }[] = [];
  for (const group of ['libs', 'libs/core', 'apps']) {
    for (const project of readdirSync(join(root, group))) {
      const manifest = join(root, group, project, 'package.json');
      if (!existsSync(manifest)) continue;
      const { name } = JSON.parse(readFileSync(manifest, 'utf8')) as {
        name: string;
      };
      const source = join(root, group, project, 'src');
      aliases.push({
        find: new RegExp(`^${name}/(.*)$`),
        replacement: `${source}/$1`,
      });
      aliases.push({
        find: new RegExp(`^${name}$`),
        replacement: `${source}/index.ts`,
      });
    }
  }
  return aliases;
};

const swcPlugin = () =>
  swc.vite({
    module: { type: 'es6' },
    jsc: {
      parser: { syntax: 'typescript', decorators: true },
      transform: {
        legacyDecorator: true,
        decoratorMetadata: true,
        useDefineForClassFields: false,
      },
    },
  });

/**
 * What stays out of the coverage denominator is not "untested code", it is code that is not logic of
 * ours: re-export barrels, type-only files, the bootstrap and the configuration. Everything else —
 * resolvers, mappers and DTOs included — counts.
 */
const coverageExclude = [
  'src/**/*.spec.ts',
  'src/**/index.ts',
  'src/**/interfaces/**',
  'src/**/*.interface.ts',
  'src/main.ts',
];

const POSTGRES_SETUP = 'libs/database/src/testing/postgres.ts';

export const testProject = ({
  name,
  include = ['src/**/*.spec.ts'],
  env,
  testTimeout = 15000,
  coverageExclude: extraExcludes = [],
  database = false,
}: ProjectTestOptions): ViteUserConfig =>
  defineConfig({
    test: {
      name,
      globalSetup: database ? [join(import.meta.dirname, POSTGRES_SETUP)] : [],
      watch: false,
      globals: true,
      environment: 'node',
      include,
      env,
      testTimeout,
      hookTimeout: 30000,
      setupFiles: ['reflect-metadata'],
      reporters: process.env.CI ? ['default', 'junit'] : ['default'],
      outputFile: { junit: 'target/test-results/junit.xml' },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: [...coverageExclude, ...extraExcludes],
        reporter: ['text', 'html', 'json', 'json-summary'],
        reportsDirectory: './coverage',
      },
    },
    resolve: { alias: workspaceAliases() },
    plugins: [swcPlugin()],
  });
