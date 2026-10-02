/// <reference path="./.sst/platform/config.d.ts" />

/**
 * This file holds **no infrastructure** — it is `app()` and dynamic imports. Everything else lives
 * in `infra/aws/`, whose README is the guide, and in `infra/sentry/`, the error tracker's projects.
 *
 * The imports are dynamic on purpose, and SST refuses a static one: the modules under `infra/`
 * create their resources at the top of the file, and a static import at the root would evaluate
 * them before `app()` had run. `app()` imports `infra/sentry/config`, which creates nothing — it is
 * what the `sentry` provider is configured with.
 */
export default $config({
  async app(input) {
    const { SENTRY_BASE_URL, SENTRY_TOKEN } = await import(
      './infra/sentry/config'
    );
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
      providers: {
        /**
         * Newer than the one SST pins (7.20.0), whose `AgentcoreAgentRuntime` refuses
         * `serverProtocol: 'AGUI'` — Theo's (`infra/aws/agents`).
         */
        aws: { version: '7.48.0' },
        command: '1.2.1',
        'docker-build': '0.0.14',
        sentry: {
          package: '@pulumiverse/sentry',
          version: '0.0.9',
          baseUrl: SENTRY_BASE_URL,
          token: SENTRY_TOKEN,
        },
        /**
         * Only a stage with a domain of its own creates DNS records — the router's and Chatwoot's, in
         * the Cloudflare zone `CLOUDFLARE_ZONE_ID` names, with `CLOUDFLARE_API_TOKEN`. See
         * `infra/aws/edge/domain.ts`.
         */
        ...(process.env.BASE_DOMAIN ? { cloudflare: '6.15.0' } : {}),
      },
    };
  },

  async run() {
    const infra = await import('./infra/aws');
    const { errorTracking } = await import('./infra/sentry');
    return { ...infra.outputs, errorTracking };
  },
});
