/// <reference path="../../../.sst/platform/config.d.ts" />

import { errorReporting } from '../../sentry';
import {
  authSecret,
  betterStackApiKey,
  betterStackUrl,
  gatewayUrl,
} from '../compute/environment';
import { database, redisUrl } from '../data';
import { router } from '../edge/router';
import { vpc } from '../network';

const PRODUCTION = $app.stage === 'production';

/**
 * **The Rails half of the system: Chatwoot, as two Fargate services on one image** — the web server
 * behind a load balancer and Sidekiq beside it — ported from `gmpa-monorepo-migrate`'s
 * `infra/aws/chatwoot.ts`.
 *
 * It is not a Lambda because it is not built to be one: Puma holds ActionCable's websockets and
 * Sidekiq polls Redis, and both want a process that stays up. And it is **on the router, by path**,
 * like everything else the browser talks to: it signs nobody in, it reads the session cookie the web
 * signs, and on the one origin that cookie simply arrives. Its paths — `/app`, `/vite`, `/cable`,
 * `/api/v1`, … — are ones the web does not serve, and its GraphQL, which the gateway calls, is
 * `/chatwoot/graphql`, rewritten, because `/graphql` is the gateway's.
 *
 * It shares what the functions use: the VPC, the Postgres — its tables in the `chatwoot` schema,
 * which the container prepares on boot (`db:chatwoot_prepare`) — and the Valkey, on database `1`, so
 * Sidekiq's queues and ActionCable's channels never share a keyspace with the sessions.
 */
const ROUTED_PATHS = [
  '/app',
  '/vite',
  '/cable',
  '/api/v1',
  '/api/v2',
  '/rails',
  '/assets',
  '/brand-assets',
  '/packs',
  '/public',
  '/hc',
  '/super_admin',
] as const;

const deploy = () => {
  const cluster = new sst.aws.Cluster('ChatwootCluster', { vpc });

  /** `sst secret set ChatwootSecretKeyBase $(openssl rand -hex 64)` — Rails' own, never shared. */
  const secretKeyBase = new sst.Secret('ChatwootSecretKeyBase');

  /**
   * Active Storage's bucket: private, read through the presigned URLs Rails redirects to, and written
   * straight from the dashboard by direct upload — which is what the CORS rule is for.
   */
  const bucket = new sst.aws.Bucket('ChatwootBucket', {
    cors: {
      allowOrigins: [router.url],
      allowMethods: ['PUT', 'GET', 'HEAD'],
      allowHeaders: ['*'],
    },
  });

  const telemetryEndpoint = betterStackUrl.startsWith('http')
    ? betterStackUrl
    : `https://${betterStackUrl}`;

  /**
   * What both processes read. The credentials for S3 are the task role's — `link: [bucket]` — which is
   * why `config/storage.yml`'s `AWS_ACCESS_KEY_ID` stays unset: an empty key is skipped and the SDK
   * falls through to the container's credentials.
   *
   * Telemetry goes **straight to Better Stack**: the collector the functions export to is a Lambda
   * extension, and a container has none beside it.
   */
  const environment = {
    RAILS_ENV: 'production',
    NODE_ENV: 'production',
    INSTALLATION_ENV: 'docker',
    RAILS_LOG_TO_STDOUT: 'true',
    LOG_LEVEL: 'info',
    MALLOC_ARENA_MAX: '2',
    SECRET_KEY_BASE: secretKeyBase.value,
    POSTGRES_HOST: database.host,
    POSTGRES_PORT: $interpolate`${database.port}`,
    POSTGRES_USERNAME: database.username,
    POSTGRES_PASSWORD: database.password,
    POSTGRES_DATABASE: database.database,
    REDIS_URL: $interpolate`${redisUrl}/1`,
    FRONTEND_URL: router.url,
    ENABLE_ACCOUNT_SIGNUP: 'false',
    AUTH_SECRET: authSecret.value,
    WEB_URL: router.url,
    GATEWAY_URL: gatewayUrl,
    ACTIVE_STORAGE_SERVICE: 'amazon',
    S3_BUCKET_NAME: bucket.name,
    AWS_REGION: aws.getRegionOutput().name,
    ...errorReporting('chatwoot'),
    OTEL_EXPORTER_OTLP_ENDPOINT: telemetryEndpoint,
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
    OTEL_EXPORTER_OTLP_HEADERS: `Authorization=Bearer%20${betterStackApiKey}`,
  };

  const size = {
    architecture: 'arm64',
    cpu: PRODUCTION ? '1 vCPU' : '0.5 vCPU',
    memory: PRODUCTION ? '2 GB' : '1 GB',
    capacity: PRODUCTION ? undefined : 'spot',
  } as const;

  /**
   * **The web server, and the one that builds the image.** `db:chatwoot_prepare` loads the schema the
   * first time (and seeds only the installation config in production — `db/seeds.rb`), then migrates;
   * a second task starting beside it waits on Rails' migration lock. The grace period covers that
   * first boot: without it the load balancer's health check kills the task while it is still loading
   * the schema.
   */
  const rails = new sst.aws.Service('ChatwootRails', {
    cluster,
    ...size,
    wait: true,
    scaling: {
      min: 1,
      max: PRODUCTION ? 4 : 1,
      cpuUtilization: 70,
      memoryUtilization: 70,
    },
    loadBalancer: {
      rules: [{ listen: '80/http', forward: '3000/http' }],
      health: {
        '3000/http': {
          path: '/api',
          interval: '30 seconds',
          timeout: '5 seconds',
          healthyThreshold: 2,
          unhealthyThreshold: 3,
        },
      },
    },
    link: [bucket],
    image: {
      context: 'apps/chatwoot',
      args: { RAILS_ENV: 'production', BUNDLE_WITHOUT: 'development:test' },
    },
    entrypoint: ['docker/entrypoints/rails.sh'],
    command: [
      'sh',
      '-c',
      'bundle exec rails db:chatwoot_prepare && exec bundle exec rails s -p 3000 -b 0.0.0.0',
    ],
    environment: {
      ...environment,
      OTEL_SERVICE_NAME: 'chatwoot',
      RAILS_MAX_THREADS: '5',
      RAILS_SERVE_STATIC_FILES: 'true',
    },
    transform: {
      service: (args) => {
        args.healthCheckGracePeriodSeconds = 300;
      },
    },
  });

  /**
   * The image the web server was deployed with, `tag@digest`, so Sidekiq runs exactly that build and
   * the deploy builds Chatwoot once rather than twice.
   */
  const image = rails.nodes.taskDefinition.containerDefinitions.apply(
    (definitions) => {
      const container = (
        JSON.parse(definitions) as { name?: string; image?: string }[]
      ).find((candidate) => candidate.name === 'ChatwootRails');
      if (!container?.image) {
        throw new Error(
          'ChatwootRails has no image in its task definition, so Sidekiq has nothing to run.',
        );
      }
      return container.image;
    },
  );

  /**
   * **Sidekiq**: every background job — webhooks, emails, the automation rules, the SLA timers. Its
   * connection pool has to be at least its concurrency, hence the larger `RAILS_MAX_THREADS`. It
   * starts once the web server is up, which is once the schema exists.
   */
  const sidekiq = new sst.aws.Service(
    'ChatwootSidekiq',
    {
      cluster,
      ...size,
      scaling: {
        min: 1,
        max: PRODUCTION ? 3 : 1,
        cpuUtilization: 70,
        memoryUtilization: 70,
      },
      link: [bucket],
      image,
      entrypoint: ['docker/entrypoints/rails.sh'],
      command: ['bundle', 'exec', 'sidekiq', '-C', 'config/sidekiq.yml'],
      environment: {
        ...environment,
        OTEL_SERVICE_NAME: 'chatwoot-sidekiq',
        RAILS_MAX_THREADS: '15',
        SIDEKIQ_CONCURRENCY: '10',
        WEB_CONCURRENCY: '0',
      },
    },
    { dependsOn: [rails] },
  );

  const origin = rails.url.apply((url) => url.replace(/\/$/, ''));
  for (const path of ROUTED_PATHS) {
    router.route(path, origin, { readTimeout: '60 seconds' });
  }
  router.route('/chatwoot/graphql', origin, {
    rewrite: { regex: '^/chatwoot/graphql$', to: '/graphql' },
    readTimeout: '60 seconds',
  });

  return { url: $interpolate`${router.url}/app`, rails, sidekiq, bucket };
};

export const chatwoot = deploy();
