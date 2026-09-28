/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * **The build is not a separate step.**
 *
 * Every function here points at a handler inside `apps/<app>/dist`, which each application's build
 * produces — so a deploy from a tree whose `dist` is stale publishes old code and says it succeeded. That is the
 * failure this resource exists to make impossible: the functions depend on it, so `sst deploy` runs
 * the build first, every time.
 *
 * ## Why the trigger is the clock and not a fingerprint of the sources
 * Because Nx already answers "did anything change?" better than a hash of a file tree can — it knows
 * the project graph, the inputs of each target and which outputs are still valid. Triggering on
 * every deploy and letting `nx` decide is one line here and a cache hit in about a second when
 * nothing moved; a fingerprint would be thirty lines that are wrong the first time somebody adds a
 * directory to the workspace.
 *
 * ## What it runs: `@nestposts/infra:build-functions`, which is `^prune` and `^build-deps`
 * The applications this stack deploys are `@nestposts/infra`'s `implicitDependencies`, and that is
 * the only place they are listed. `build-functions` asks each Nest application for its `prune` —
 * Nx's own deploy step: the application's `dist`, its pruned `package.json` and lockfile, and the
 * workspace modules it declares copied into `dist/workspace_modules`, built. Each `prune` waits for
 * its application's `build`, and the gateway's for its `supergraph` as well.
 *
 * The web has no `prune`: OpenNext packages it, by running its `build` SCRIPT rather than its Nx
 * target, so nothing there asks for what that target depends on. `build-deps` is that list —
 * `codegen`, `^build`, and `^typecheck`, without which `next build` stops on `TS6305: Output file
 * 'libs/ui/dist/…d.ts' has not been built`, `libs/ui` and `libs/tanstack-query-graphql` being source
 * packages whose declarations only `typecheck` writes.
 *
 * A second list already drifted twice. `tools/github/deploy-sst` has to run the same thing BEFORE
 * `sst deploy`: SST reads every `copyFiles` source while it evaluates the program, before this
 * resource has run, so a runner's clean checkout failed with
 * `ENOENT: stat 'apps/gateway/dist/subgraphs'` the day the gateway was added to this resource's
 * list and not to that one. Both now run the target, and the second run is a cache hit.
 *
 * Not `pnpm build`: it would build `apps/web` too — and OpenNext builds it again, itself, from
 * inside the app. Two `next build` runs against one `.next` is a race, and it announces itself as
 * `ENOENT: mkdir .next/export` from whichever one lost.
 *
 * ## And the supergraph, which is not a build output any more
 * OpenNext runs the web's `build` script — `graphql-codegen && next build` — and not its Nx target,
 * so nothing asks for the codegen's `dependsOn`: the schema it reads, `apps/gateway/dist/supergraph`,
 * has to be there already. The gateway's webpack build deletes whatever in `dist` it did not emit, and
 * the supergraph is `node dist/compose.js`'s, so every rebuild of the gateway took it away and the web
 * failed with `Unknown type: "Author"` — reading `federation.graphql` alone. It deployed for as long
 * as a supergraph from some earlier run happened to be left behind. The web's builder waits for this
 * resource already: its environment names the functions' URLs, and the functions depend on it.
 */
const buildCommand = 'npx nx run @nestposts/infra:build-functions';

export const build = new command.local.Command('Build', {
  create: buildCommand,
  update: buildCommand,
  dir: $cli.paths.root,
  triggers: [Date.now().toString()],
});
