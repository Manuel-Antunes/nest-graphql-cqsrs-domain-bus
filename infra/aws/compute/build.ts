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
 */
const APPLICATIONS = [
  '@nestposts/gateway',
  '@nestposts/posts-api',
  '@nestposts/tagging',
  '@nestposts/notificator',
  '@nestposts/migrator',
];

/**
 * **The applications the functions point at, and not the whole workspace.**
 *
 * `pnpm build` would build `apps/web` too — and OpenNext builds it again, itself, from inside the
 * app. Two `next build` runs against one `.next` is a race, and it announces itself as
 * `ENOENT: mkdir .next/export` from whichever one lost. Naming them keeps this resource to what
 * it is for: the `dist` the Lambda handlers are bundled from. The Nest applications bundle the
 * libraries from source; the migrator still builds the ones it depends on, through `^build`.
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
const buildCommand = `npx nx run-many --targets=build,supergraph --projects=${APPLICATIONS.join(',')}`;

export const build = new command.local.Command('Build', {
  create: buildCommand,
  update: buildCommand,
  dir: $cli.paths.root,
  triggers: [Date.now().toString()],
});
