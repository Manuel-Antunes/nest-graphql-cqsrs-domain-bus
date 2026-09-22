/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * **The build is not a separate step.**
 *
 * Every function here points at a handler inside `apps/dist`, which `nest build` produces — so a
 * deploy from a tree whose `dist` is stale publishes old code and says it succeeded. That is the
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
const APPLICATIONS = ['@nestposts/posts-api', '@nestposts/tagging', '@nestposts/migrator'];

/**
 * **The three applications the functions point at, and not the whole workspace.**
 *
 * `pnpm build` would build `apps/web` too — and OpenNext builds it again, itself, from inside the
 * app. Two `next build` runs against one `.next` is a race, and it announces itself as
 * `ENOENT: mkdir .next/export` from whichever one lost. Naming the three keeps this resource to what
 * it is for: the `dist` the Lambda handlers are bundled from. Nx still builds the libraries they
 * depend on, because their build target declares `^build`.
 */
const buildCommand = `npx nx run-many -t build --projects=${APPLICATIONS.join(',')}`;

export const build = new command.local.Command('Build', {
  create: buildCommand,
  update: buildCommand,
  dir: $cli.paths.root,
  triggers: [Date.now().toString()],
});
