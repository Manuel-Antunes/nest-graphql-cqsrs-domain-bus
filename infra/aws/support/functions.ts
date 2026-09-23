/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * **The definitions.** Nothing in this file creates a resource when it is imported — it declares
 * what a function of this system *is*, and `compute/` is what instantiates them. The arrow points
 * one way: the definer does not know the instantiator.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Node 22, which is what `require(esm)` needs — see the note on MikroORM in `CLAUDE.md`. */
const RUNTIME = 'nodejs22.x';

/**
 * **Installed as real files instead of bundled**, and the list is short on purpose.
 *
 * Only what genuinely cannot be bundled is here:
 *
 * - **ESM-only packages this repository loads through Node's own `require(esm)`** — MikroORM,
 *   better-auth, AutoMapper. `apps/web` wrote the same lesson down in `next.config.ts`: the
 *   combination that works is a plain `require` into a real `node_modules`.
 * - **The OpenTelemetry instrumentations**, which work by patching modules **as they are required** —
 *   precisely what bundling removes. A bundled `pg` is a `pg` nothing can instrument, and the traces
 *   come out missing the database with nothing to say they are. `pg` and the AWS clients are here
 *   because they are what those instrumentations patch.
 *
 * ## What must stay bundled, however ESM it is: anything that bridges to Nest
 * `@mikro-orm/nestjs`, `@thallesp/nestjs-better-auth` and `@automapper/nestjs` are **not** here, and
 * putting them here is what taught the rule. Installed, they require `@nestjs/core` from disk while
 * the bundle carries its own copy — and two copies of Nest are two `ModuleRef` classes, so the
 * container cannot resolve one against the other:
 *
 * ```
 * Nest can't resolve dependencies of the MikroOrmCoreModule (Symbol(mikro-orm-module-options), ?).
 * Please make sure that the argument ModuleRef at index [1] is available.
 * ```
 *
 * **A package that bridges to Nest belongs on the same side of the bundle boundary as Nest.** Its
 * own dependency — `@mikro-orm/core`, `better-auth`, `@automapper/core` — can still be a real file,
 * because that one is a leaf: nothing compares its classes across the boundary.
 *
 * ## Why NOT everything, which was tried
 * Installing every dependency and bundling only our own code is the tidier rule, and it fails: with
 * `require(esm)` enabled, Nest on disk resolves to its ESM build, and Nest has internal cycles —
 * `Cannot require() ES Module @nestjs/common/... in a cycle. A cycle involving require(esm) is not
 * allowed.` Bundled, that resolution happens at **build** time, where esbuild takes the CommonJS
 * branch and the cycle is just a cycle.
 *
 * So each side gets what it needs: Nest and everything like it are bundled, and the handful that has
 * to stay a real file stays one.
 */
const INSTALLED_PACKAGES = [
  '@mikro-orm/core',
  '@mikro-orm/postgresql',
  '@mikro-orm/decorators',
  'better-auth',
  'better-auth-mikro-orm',
  '@better-auth/oauth-provider',
  '@automapper/core',
  '@automapper/classes',
  'pg',
  '@aws-sdk/client-sns',
  '@aws-sdk/client-sqs',
  '@opentelemetry/api',
  '@opentelemetry/sdk-node',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/instrumentation',
  '@opentelemetry/instrumentation-http',
  '@opentelemetry/instrumentation-nestjs-core',
  '@opentelemetry/instrumentation-graphql',
  '@opentelemetry/instrumentation-pg',
  '@opentelemetry/instrumentation-amqplib',
  '@opentelemetry/instrumentation-aws-sdk',
  '@opentelemetry/instrumentation-aws-lambda',
  'pino',
  '@opentelemetry/instrumentation-pino',
  '@opentelemetry/sdk-logs',
  '@opentelemetry/exporter-logs-otlp-http',
];

/**
 * **The version each of those is pinned to: the one this repository has installed.**
 *
 * `nodejs.install` takes either a list of names or a map of name to version, and the list form is a
 * trap: SST expands it to `{ name: "*" }` and runs an install inside the artifact, so the **lockfile
 * is ignored** and every version is re-resolved at deploy time. `*` also does not select
 * prereleases, and that is not hypothetical — it is how this repository's
 * `better-auth-mikro-orm@1.0.0-next.2` was deployed as **0.5.0**, a different major line whose
 * adapter calls `metadata.has()` where MikroORM 7 wants `getByClassName()`. Everything booted; the
 * first `/api/auth/*` request answered
 * `Cannot find metadata for "AuthUser" entity`, and only on AWS — locally the same code signs in.
 *
 * Reading the version off the installed tree is what makes the deployed dependency the **tested**
 * dependency. A package is looked up from every workspace root because a library declares its own
 * dependencies: `better-auth` belongs to `libs/auth`, not to the repository root.
 */
class InstalledPackages {
  /** Each name mapped to the version this workspace has on disk, ready for `nodejs.install`. */
  static pinnedTo(names: readonly string[]): Record<string, string> {
    return Object.fromEntries(
      names.map((name) => [name, InstalledPackages.versionOf(name)]),
    );
  }

  /** The repository root and every workspace package in it, in lookup order. */
  private static roots(): string[] {
    const root = $cli.paths.root;
    const roots = [root];
    for (const group of ['libs', 'apps']) {
      const directory = join(root, group);
      if (!existsSync(directory)) continue;
      for (const entry of readdirSync(directory)) {
        roots.push(join(root, group, entry));
      }
    }
    return roots;
  }

  private static versionOf(name: string): string {
    for (const root of InstalledPackages.roots()) {
      const manifest = join(
        root,
        'node_modules',
        ...name.split('/'),
        'package.json',
      );
      if (existsSync(manifest)) {
        const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as {
          version: string;
        };
        if (version) return version;
      }
    }
    throw new Error(
      `${name} is listed in INSTALLED_PACKAGES but is not installed anywhere in the workspace, so ` +
        'there is no version to pin it to. Install it, or take it off the list.',
    );
  }
}

const NOT_BUNDLED: Record<string, string> =
  InstalledPackages.pinnedTo(INSTALLED_PACKAGES);

/**
 * **Left out entirely**, because nothing here uses them and nothing here can resolve them.
 *
 * `@nestjs/core`, `@nestjs/microservices`, `@nestjs/graphql` and the Fastify adapter reach for a
 * package the moment a feature is asked for — Kafka, Redis, MQTT, NATS, gRPC, the WebSocket adapter,
 * static files, view engines — through `loadPackage`, which is a `require` inside a **try/catch**.
 * That is a runtime decision and a bundler cannot see it: esbuild follows the `require`, fails to
 * resolve a package this repository never installed, and the deploy stops with
 * `Could not resolve "kafkajs"` for an application that speaks SQS.
 *
 * **`@apollo/subgraph` used to be on this list and is not any more.** It was here on the grounds
 * that nothing asked for federation; `apps/posts-api` is a subgraph now, so `buildSubgraphSchema` is
 * `loadPackage`d on **every** boot. External, the `require` throws and the application does not
 * start. It has to be **bundled** rather than moved to {@link NOT_BUNDLED}, because it builds
 * `GraphQLSchema` objects that must come from the same `graphql` the bundle carries — two copies of
 * `graphql` is a schema the server refuses to execute.
 *
 * They are not in {@link NOT_BUNDLED} either, because they are not dependencies: installing them
 * would put megabytes of unused transports in every function to satisfy a `require` that never runs.
 * Marked external, the `require` stays, throws, and is caught — which is what it was written to do.
 *
 * Nothing goes on this list to silence a bundler. `ssh2` and `cpu-features` were here once, to get
 * past Testcontainers being reachable from `@nestposts/transport-eventbus`'s barrel; that hid the
 * problem until the function answered `Runtime.ImportModuleError: Cannot find module 'ssh2'` in
 * production. The doubles moved behind their own subpath instead.
 */
const NOT_NEEDED = [
  '@nestjs/websockets',
  '@nestjs/websockets/*',
  '@fastify/static',
  '@fastify/view',
  'kafkajs',
  'ioredis',
  'mqtt',
  'nats',
  '@nats-io/*',
  '@grpc/*',
];

/**
 * **The OpenTelemetry collector, as a Lambda extension.**
 *
 * Published per region by the upstream `opentelemetry-lambda` project. It receives OTLP on
 * `localhost` and owns the batching, the retrying and the flushing — see `infra/lambda/collector.yaml`
 * for why that is worth a layer.
 *
 * The version is pinned because a layer ARN is a version: there is no `:latest`, and a collector that
 * changed underneath a working stack is not something to discover from a trace that stopped arriving.
 *
 * It is attached to **every** function, unconditionally, because its destination is required: the
 * `.env` at the root has to name a Better Stack source or the deploy stops. There is no stage that
 * runs with telemetry configured and no collector to take it.
 */
export const COLLECTOR_LAYER = $interpolate`arn:aws:lambda:${aws.getRegionOutput().name}:184161586896:layer:opentelemetry-collector-arm64-0_23_0:1`;

/** The collector's own config, which travels beside the bundle like the GraphQL SDL does. */
export const COLLECTOR_CONFIG = {
  from: 'infra/lambda/collector.yaml',
  to: 'collector.yaml',
};

/** The OpenTelemetry preload, beside the bundle for the same reason. Its own file says why. */
export const OTEL_PRELOAD = {
  from: 'infra/lambda/otel-preload.cjs',
  to: 'otel-preload.cjs',
};

/**
 * **`--require` is what makes `@opentelemetry/instrumentation-aws-lambda` possible at all**, and it
 * belongs HERE rather than in `sharedEnvironment`.
 *
 * That object is spread into `apps/web`'s Next server too, and that function is built by OpenNext:
 * it carries neither this file nor the OpenTelemetry packages it requires. A `--require` it cannot
 * resolve is `MODULE_NOT_FOUND` before the first line of the handler — a 500 on every page, which is
 * exactly the failure `sharedEnvironment` was extracted to prevent, arriving from the other side.
 */
export const BASE_NODE_OPTIONS = '--experimental-require-module';

const PRELOADED_NODE_OPTIONS = `${BASE_NODE_OPTIONS} --require /var/task/otel-preload.cjs`;

/** Where every function of this system lives, what it is allowed to reach, and what it waits for. */
export interface LambdaPlatform {
  readonly vpc: sst.aws.Vpc;
  readonly link: unknown[];
  readonly environment: Record<string, $util.Input<string>>;
  /** The build that produces the `dist/` these handlers point at — see `compute/build.ts`. */
  readonly dependsOn?: $util.Resource[];
}

export interface NodeFunctionArgs {
  readonly platform: LambdaPlatform;
  /** `apps/tagging/dist/lambda/sqs.handler` — the file `nest build` emitted, and its export. */
  readonly handler: string;
  readonly timeout?: $util.Input<
    | `${number} second`
    | `${number} seconds`
    | `${number} minute`
    | `${number} minutes`
  >;
  readonly memory?: $util.Input<`${number} MB` | `${number} GB`>;
  readonly environment?: Record<string, $util.Input<string>>;
  /**
   * Files that have to be **beside** the bundle rather than in it — the GraphQL SDL, which is read
   * from disk at boot (`typePaths`) and which a bundler has no reason to notice.
   */
  readonly copyFiles?: { from: string; to?: string }[];
}

/**
 * **A Nest application, as a function.**
 *
 * Everything here that is not a default is a decision that fails silently if it is reversed:
 *
 * - **`minify: false` and `keepNames: true`.** Nest's dependency injection and AutoMapper read the
 *   `design:type` metadata `tsc` emitted and look classes up by **name**. Minifying renames them,
 *   the metadata then describes types nothing can resolve, and the build still succeeds — the
 *   failure is a provider that resolves to `undefined` at runtime, far from the cause. It is the
 *   same reason `nest build` stays on `tsc` and no bundler is allowed near the applications.
 * - **the handler points at `dist/`**, which `nest build` already compiled, decorators included. So
 *   esbuild only ever bundles here; it never transpiles a decorator, which it cannot do.
 * - **`install`**, above.
 */
export class NodeFunction extends $util.ComponentResource {
  readonly fn: sst.aws.Function;

  constructor(
    name: string,
    args: NodeFunctionArgs & {
      readonly url?: sst.aws.FunctionArgs['url'];
      readonly streaming?: boolean;
    },
    opts?: $util.ComponentResourceOptions,
  ) {
    super('nestposts:aws:NodeFunction', name, {}, opts);

    this.fn = new sst.aws.Function(
      name,
      {
        handler: args.handler,
        runtime: RUNTIME,
        architecture: 'arm64',
        timeout: args.timeout ?? '30 seconds',
        memory: args.memory ?? '1024 MB',
        vpc: args.platform.vpc,
        link: args.platform.link as never[],
        layers: [COLLECTOR_LAYER],
        url: args.url,
        streaming: args.streaming,
        copyFiles: [COLLECTOR_CONFIG, OTEL_PRELOAD, ...(args.copyFiles ?? [])],
        environment: {
          ...args.platform.environment,
          ...args.environment,
          NODE_OPTIONS: PRELOADED_NODE_OPTIONS,
        },
        nodejs: {
          /**
           * **CommonJS, and it is not a preference.** SST bundles as ESM by default, and in an ESM
           * bundle esbuild's `require` shim is not a real `require` — so the first call into an
           * ESM-only package dies with
           * `require() of ES Module @mikro-orm/postgresql/index.js from bundle.mjs not supported`.
           *
           * This whole repository runs as CommonJS on Node 22's own `require(esm)`: that is how
           * `node dist/main.js` loads MikroORM and better-auth today, and it is the only combination
           * that works with code `tsc` compiled to CJS. The bundle has to be the same thing.
           */
          format: 'cjs',
          minify: false,
          keepNames: true,
          install: NOT_BUNDLED,
          esbuild: {
            external: NOT_NEEDED,
            /**
             * Several bundled packages ask Node where they are with
             * `createRequire(import.meta.url)` — `@nestjs/graphql` and `fdir` among them. In a
             * CommonJS bundle there is no `import.meta`, so the call receives `undefined` and throws
             * while the module is still initialising, before any handler runs. `__filename` is the
             * same answer in the form this bundle can give, and `createRequire` takes an absolute
             * path as readily as a file URL.
             */
            define: { 'import.meta.url': '__filename' },
          },
        },
      },
      { parent: this, dependsOn: args.platform.dependsOn ?? [] },
    );

    this.registerOutputs({ arn: this.fn.arn });
  }

  get arn(): $util.Output<string> {
    return this.fn.arn;
  }

  get functionName(): $util.Output<string> {
    return this.fn.name;
  }
}

export interface QueueWorkerArgs extends NodeFunctionArgs {
  readonly queue: sst.aws.Queue;
}

/**
 * **A function fed by one queue.**
 *
 * `partialResponses` is what makes `processSqsEvent`'s answer mean anything: without it AWS ignores
 * `batchItemFailures` entirely and decides the whole batch by whether the invocation threw — so one
 * poison message redrives the nine that succeeded beside it, and a handler that returns instead
 * deletes the one that failed. It is not a tuning option, which is why it is here and not in a
 * caller.
 */
export class QueueWorker extends NodeFunction {
  constructor(
    name: string,
    args: QueueWorkerArgs,
    opts?: $util.ComponentResourceOptions,
  ) {
    super(name, args, opts);

    args.queue.subscribe(
      this.fn.arn,
      { batch: { partialResponses: true, size: 10 } },
      {
        parent: this,
      },
    );
  }
}

/**
 * **The migrations, run by the deploy that needs them.**
 *
 * The invocation is a resource, and `Date.now()` as its input is what makes it run on **every**
 * deploy: a migration that fails becomes a deploy that fails, instead of a forgotten function and a
 * `relation "posts.post" does not exist` on the first request. Re-running costs one query against
 * the history table.
 *
 * `if (!$dev)` because under `sst dev` there is no published artifact to invoke.
 *
 * ## The first deploy of a stage can lose a race, and this is where it shows
 * `POSTGRES_URL` interpolates `database.host`, so the deploy graph orders this after the RDS
 * **Proxy** — and a proxy is reachable long before it is usable. `RegisterDBProxyTargets` returns at
 * once and the target then sits in `PENDING_PROXY_CAPACITY` for minutes, accepting the TCP
 * connection and closing it, so the invocation fails in **141ms** with
 * `Error: Connection terminated unexpectedly` from `pg-pool` with nothing wrong with the code.
 * Measured: proxy created 14:21:48, instance 14:22:40, invocation failed 14:29:59, and the same
 * function migrated in three seconds at 14:36:00.
 *
 * Nothing here retries it. Re-running `sst deploy` is the answer, and on every deploy after the
 * first there is no race to lose.
 */
export class Migrator extends NodeFunction {
  constructor(
    name: string,
    args: NodeFunctionArgs,
    opts?: $util.ComponentResourceOptions,
  ) {
    super(name, { ...args, timeout: args.timeout ?? '15 minutes' }, opts);

    if (!$dev) {
      new aws.lambda.Invocation(
        `${name}Invocation`,
        {
          functionName: this.fn.name,
          input: JSON.stringify({ command: 'migrate', at: Date.now() }),
        },
        { parent: this },
      );
    }
  }
}

/**
 * **Every file under these paths, as one digest.**
 *
 * Content and not a timestamp, because that is the difference between "run again" and "run again
 * **if it changed**" — see {@link Seeder}.
 */
class Fingerprint {
  static of(paths: readonly string[]): string {
    const digest = createHash('sha256');
    [...paths].sort().forEach((path) => {
      Fingerprint.absorb(digest, path);
    });
    return digest.digest('hex').slice(0, 32);
  }

  private static absorb(
    digest: ReturnType<typeof createHash>,
    path: string,
  ): void {
    if (!statSync(path).isDirectory()) {
      digest.update(path);
      digest.update(readFileSync(path));
      return;
    }
    for (const entry of readdirSync(path).sort()) {
      Fingerprint.absorb(digest, join(path, entry));
    }
  }
}

/**
 * **The seeders, run by the deploy — but only when they changed.**
 *
 * The difference from {@link Migrator} is the invocation's input, and it is the whole point.
 * `Migrate` takes `Date.now()`, so it runs on **every** deploy: migrations are a ledger, re-running
 * costs one query, and a migration that fails should fail the deploy. Seeding is not that. It writes
 * rows a person may since have edited — a seeded user's name, a password somebody rotated — so
 * re-running it on every deploy is a deploy that quietly undoes their work.
 *
 * The input is therefore a **digest of the seeder sources**. Pulumi re-runs an invocation when its
 * input changes and leaves it alone when it does not, so the rule this encodes is exactly the one
 * worth having: the seeders run when the seeders change. Each one is written to be re-runnable
 * anyway — `TestUsersSeeder` skips an e-mail that already exists — because "changed" includes
 * changing one seeder in a file that holds three.
 */
export class Seeder extends NodeFunction {
  constructor(
    name: string,
    args: NodeFunctionArgs & { readonly seeds: readonly string[] },
    opts?: $util.ComponentResourceOptions,
  ) {
    super(name, { ...args, timeout: args.timeout ?? '5 minutes' }, opts);

    if (!$dev) {
      new aws.lambda.Invocation(
        `${name}Invocation`,
        {
          functionName: this.fn.name,
          input: JSON.stringify({
            command: 'seed',
            seeders: Fingerprint.of(args.seeds),
          }),
        },
        { parent: this },
      );
    }
  }
}

/**
 * **The HTTP entry point, answering as a stream.**
 *
 * A Function URL with `InvokeMode: RESPONSE_STREAM` is the only way AWS does response streaming —
 * API Gateway does not, in any mode. That is what buys a GraphQL response whose first byte leaves
 * before the last one is computed, and it is what an SSE subscription would need.
 *
 * `authorization: 'none'` because the application authorises: Better Auth owns the session, and a
 * signed cookie is checked by the guard inside the container, not by IAM outside it.
 */
export class StreamingFunction extends NodeFunction {
  constructor(
    name: string,
    args: NodeFunctionArgs,
    opts?: $util.ComponentResourceOptions,
  ) {
    super(
      name,
      {
        ...args,
        timeout: args.timeout ?? '5 minutes',
        streaming: true,
        url: { authorization: 'none', cors: false },
      },
      opts,
    );
  }

  get url(): $util.Output<string> {
    return this.fn.url as unknown as $util.Output<string>;
  }
}
