/// <reference path="../../../.sst/platform/config.d.ts" />

import { streaming } from '../compute';
import {
  authSecret,
  gatewayUrl,
  sharedEnvironment,
} from '../compute/environment';
import { router } from '../edge';
import { postEvents } from '../messaging';
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
 *
 * It PUBLISHES to the events topic, too: the emails its Better Auth asks for — verification, reset,
 * magic link, one-time codes, invitations — are notifications, and the notificator's queue is
 * subscribed to them. The link is what grants `sns:Publish` on that topic and nothing else.
 */
export const web = new sst.aws.Nextjs('Web', {
  path: 'apps/web',
  vpc,
  router: { instance: router },
  link: [postEvents],
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
    AUTH_SECRET: authSecret.value,
    AUTH_URL: router.url,
    WEB_URL: router.url,
    AUTH_TRUSTED_ORIGINS: router.url,
    NEXT_PUBLIC_API_URL: router.url,
    NEXT_PUBLIC_GATEWAY_URL: gatewayUrl,
    POSTS_SUBGRAPH_URL: streaming.url.apply(
      (url) => `${url.replace(/\/$/, '')}/graphql`,
    ),
    GATEWAY_URL: gatewayUrl,
    WEB_TRANSPORT: 'aws',
    WEB_TOPIC_ARN: postEvents.arn,
  },
});
