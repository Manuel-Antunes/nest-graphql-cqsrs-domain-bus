/// <reference path="../../../.sst/platform/config.d.ts" />

import { authSecret, sharedEnvironment } from '../compute/environment';
import { router } from '../edge';
import { vpc } from '../network';
import { COLLECTOR_CONFIG, COLLECTOR_LAYER } from '../support';

/**
 * **The Next application, on the same origin as the API.**
 *
 * It is in the VPC because it is not only a front end: `apps/web` boots a Nest container of its own
 * with the same `BetterAuthModule` and the same MikroORM, so it talks to the database directly. That
 * is what `AUTH_SECRET` being one value is about — the cookie this application signs is the cookie
 * the API resolves.
 *
 * It carries the **collector extension** for the same reason every other function does, and it has to
 * ask for it by hand: `sst.aws.Nextjs` builds its own server function rather than going through
 * {@link NodeFunction}, so the layer and `collector.yaml` are attached here, through `transform`.
 * Without them `OTEL_EXPORTER_OTLP_ENDPOINT` would point at a `localhost` with nothing listening, and
 * the one application a person actually looks at would be the one missing from the traces.
 */
export const web = new sst.aws.Nextjs('Web', {
  path: 'apps/web',
  vpc,
  router: { instance: router },
  server: {
    timeout: '60 seconds',
    architecture: 'arm64',
    layers: [COLLECTOR_LAYER],
  },
  transform: {
    server: (args) => {
      args.copyFiles = [
        ...((args.copyFiles as { from: string; to?: string }[]) ?? []),
        COLLECTOR_CONFIG,
      ];
    },
  },
  environment: {
    ...sharedEnvironment,
    OTEL_SERVICE_NAME: 'web',
    POSTS_SCHEMA: 'posts',
    AUTH_SECRET: authSecret.value,
    AUTH_URL: router.url,
    WEB_URL: router.url,
    AUTH_TRUSTED_ORIGINS: router.url,
    NEXT_PUBLIC_API_URL: router.url,
  },
});
