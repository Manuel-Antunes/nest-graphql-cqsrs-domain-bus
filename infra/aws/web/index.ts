/// <reference path="../../../.sst/platform/config.d.ts" />

import { errorReporting } from '../../sentry';
import { postsMcp, theo } from '../agents';
import { streaming } from '../compute';
import {
  authGoogleId,
  authGoogleSecret,
  authSecret,
  gatewayUrl,
  mcpResource,
  polarAccessToken,
  polarEnvironment,
  polarWebhookSecret,
  postsAgentResource,
  sharedEnvironment,
  theoResource,
} from '../compute/environment';
import { router } from '../edge';
import { postEvents } from '../messaging';
import { vpc } from '../network';
import { bucket, filesUrl } from '../storage';
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
 * It is where a person talks to Theo (`infra/aws/agents`): its `/api/copilotkit` route runs the
 * CopilotKit runtime, which calls Theo's AgentCore invocation URL with an access token this
 * application's own Better Auth issues for the person, addressed to Theo, the posts agent and the
 * posts MCP server. That route streams, so the server function streams: `apps/web/open-next.config.ts`
 * picks OpenNext's streaming wrapper, which is what makes SST create the function URL in
 * `RESPONSE_STREAM` mode. The runtime's telemetry is off.
 *
 * It PUBLISHES to the events topic, too: the emails its Better Auth asks for — verification, reset,
 * magic link, one-time codes, invitations — are notifications, and the notificator's queue is
 * subscribed to them. The link is what grants `sns:Publish` on that topic and nothing else.
 */
const webErrorReporting = errorReporting('web');

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
    ...webErrorReporting,
    NEXT_PUBLIC_SENTRY_DSN: webErrorReporting.SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: webErrorReporting.SENTRY_ENVIRONMENT,
    ...(webErrorReporting.SENTRY_RELEASE
      ? { NEXT_PUBLIC_SENTRY_RELEASE: webErrorReporting.SENTRY_RELEASE }
      : {}),
    AUTH_SECRET: authSecret.value,
    AUTH_URL: router.url,
    WEB_URL: router.url,
    AUTH_TRUSTED_ORIGINS: router.url,
    AUTH_GOOGLE_ID: authGoogleId.value,
    AUTH_GOOGLE_SECRET: authGoogleSecret.value,
    DRIVE_BUCKET: bucket.name,
    DRIVE_CDN_URL: filesUrl,
    NEXT_PUBLIC_API_URL: router.url,
    NEXT_PUBLIC_GATEWAY_URL: gatewayUrl,
    POSTS_SUBGRAPH_URL: streaming.url.apply(
      (url) => `${url.replace(/\/$/, '')}/graphql`,
    ),
    GATEWAY_URL: gatewayUrl,
    WEB_TRANSPORT: 'aws',
    WEB_TOPIC_ARN: postEvents.arn,
    WEB_OUTBOX_RELAY: 'drain',
    POLAR_ACCESS_TOKEN: polarAccessToken.value,
    POLAR_ENVIRONMENT: polarEnvironment.value,
    POLAR_WEBHOOK_SECRET: polarWebhookSecret.value,
    CHATWOOT_URL: router.url,
    THEO_AGENT_URL: theo.url,
    THEO_AGENT_AUDIENCES: $interpolate`${theoResource},${postsAgentResource},${mcpResource}`,
    POSTS_MCP_URL: postsMcp.url,
    POSTS_MCP_RESOURCE: mcpResource,
    COPILOTKIT_TELEMETRY_DISABLED: 'true',
  },
});

const webServer = $output(web.nodes.server).apply((server) => {
  if (!server) {
    throw new Error(
      'The web has no server function, so billing has nowhere to be routed.',
    );
  }
  return server.url.apply((url) => url.replace(/\/$/, ''));
});

for (const billingPath of [
  '/api/auth/billing',
  '/api/auth/checkout',
  '/api/auth/polar',
]) {
  router.route(billingPath, webServer);
}
