/// <reference path="./.sst/platform/config.d.ts" />

/**
 * This file holds **no infrastructure** — it is `app()` and one dynamic import, and everything else
 * lives in `infra/aws/`, whose README is the guide.
 *
 * The import is dynamic on purpose: the modules under `infra/` create their resources at the top of
 * the file, and a static import at the root would evaluate them before `app()` had run.
 */
export default $config({
  app(input) {
    return {
      name: 'nestposts',
      removal: input.stage === 'production' ? 'retain' : 'remove',
      protect: input.stage === 'production',
      home: 'aws',
      /**
       * `compute/build.ts` runs `pnpm build` before the functions are published: their handlers
       * point into each application's `dist`, and a deploy from a stale tree publishes old code
       * successfully.
       */
      providers: { command: '1.2.1' },
    };
  },

  async run() {
    const infra = await import('./infra/aws');
    return infra.outputs;
  },
});
