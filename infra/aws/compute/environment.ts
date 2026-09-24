/// <reference path="../../../.sst/platform/config.d.ts" />

import { postgresUrl } from '../data';
import { router } from '../edge/router';
import { mailFrom } from '../mail';
import {
  completed,
  notificatorNotifications,
  postEvents,
  taggingEvents,
} from '../messaging';
import { bucket, filesUrl } from '../storage';
import { BASE_NODE_OPTIONS } from '../support';

/**
 * **Every process that reads a session shares this**, `apps/web` included — it is what makes a
 * cookie signed by the web application resolve in the API. `sst secret set AuthSecret <value>`.
 */
export const authSecret = new sst.Secret('AuthSecret');

/**
 * **A variable the deploy cannot do without**, read from the `.env` at the root of the repository —
 * which `sst deploy` loads by itself, and `.env.example` documents.
 *
 * It throws rather than defaulting to empty. A stage that deploys with nowhere to send telemetry is
 * the worst of the three outcomes: it costs the same, it looks healthy, and it answers nothing when
 * somebody finally asks what happened.
 */
const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. It comes from the .env at the root of the repository (see .env.example), ` +
        'which SST loads on its own. It is where the telemetry of EVERY function goes.',
    );
  }
  return value;
};

/**
 * **Where telemetry ultimately goes**: the Better Stack source's ingesting host and its token.
 *
 * Note what these are **not**: the applications never talk to Better Stack. They export to the
 * collector on `localhost`, and `infra/lambda/collector.yaml` is what talks to this.
 */
export const betterStackUrl = requiredEnv('BETTER_STACK_URL');

export const betterStackApiKey = requiredEnv('BETTER_STACK_API_KEY');

/**
 * **What every function of this system needs, wherever it runs** — and it is exported so that the
 * one function SST builds for us, `apps/web`'s Next server, spreads it instead of redeclaring it.
 *
 * That is not tidiness. The web function drifted exactly once, by listing its own variables and
 * missing `NODE_OPTIONS`, and the symptom was a **500 on every page**:
 * `ERR_REQUIRE_ESM: require() of ES Module @nestjs/core/index.js from .next/server/app/page.js`.
 * Spread, a variable added here cannot be missing there.
 */
export const sharedEnvironment = {
  NODE_ENV: 'production',
  /**
   * **What lets a CommonJS bundle load an ESM-only package**, which is the shape everything here has:
   * the applications are compiled to CJS by `tsc`, and MikroORM, better-auth and AutoMapper ship ESM
   * only. Locally that works because Node 22.12+ does `require(esm)` on its own; the `nodejs22.x`
   * Lambda runtime measured here does not, and the failure is
   * `ERR_REQUIRE_ESM: require() of ES Module @mikro-orm/postgresql/index.js`, from a function that
   * bundled and deployed successfully.
   *
   * The flag is what the capability was called before it was on by default, and it is still accepted
   * where it already is — so this is safe to keep when the runtime catches up.
   */
  NODE_OPTIONS: BASE_NODE_OPTIONS,
  POSTGRES_URL: postgresUrl,
  /**
   * The application exports **to the collector beside it**, never over the network. What the
   * collector then does with it is the two variables below, which are its configuration and not the
   * application's.
   */
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  OPENTELEMETRY_COLLECTOR_CONFIG_URI: '/var/task/collector.yaml',
  BETTER_STACK_URL: betterStackUrl,
  BETTER_STACK_API_KEY: betterStackApiKey,
};

export const postsEnvironment = {
  ...sharedEnvironment,
  OTEL_SERVICE_NAME: 'posts-api',
  POSTS_TRANSPORT: 'aws',
  POSTS_TOPIC_ARN: postEvents.arn,
  POSTS_COMPLETED_QUEUE_URL: completed.url,
  POSTS_SCHEMA: 'posts',
  /**
   * **How long an SSE subscription is allowed to live**, well under the function's 300s timeout.
   *
   * It exists because Lambda never tells a function that its client hung up: a response stream stays
   * `writable` and emits nothing, so a subscriber who closed the tab keeps an invocation — and the
   * event log poll behind it — alive until the timeout kills it. There is no signal to wait for, so
   * the stream ends itself and the `graphql-sse` client reconnects.
   *
   * The number is a trade: shorter wastes less on a client that already left, longer reconnects a
   * live one less often. Each reconnect starts at the log's head, so it is also how wide a window of
   * missed events is accepted. Only a deployment can decide this, which is why the default is off.
   */
  SUBSCRIPTION_MAX_SECONDS: '120',
  /**
   * The local `EventBus` is one per container, and here there are several: the one that closes the
   * saga is the queue function, the one holding a subscription open is the HTTP one. `feed` points
   * the subscriptions at the shared log both of them write to — see `SubscriptionSource`.
   */
  POSTS_SUBSCRIPTION_SOURCE: 'feed',
  AUTH_SECRET: authSecret.value,
  AUTH_URL: router.url,
  WEB_URL: router.url,
  AUTH_TRUSTED_ORIGINS: router.url,
  DRIVE_BUCKET: bucket.name,
  DRIVE_CDN_URL: filesUrl,
};

export const taggingEnvironment = {
  ...sharedEnvironment,
  OTEL_SERVICE_NAME: 'tagging',
  TAGGING_TRANSPORT: 'aws',
  TAGGING_TOPIC_ARN: postEvents.arn,
  TAGGING_QUEUE_URL: taggingEvents.url,
  TAGGING_SCHEMA: 'tagging',
};

/**
 * **The notificator lives in the `posts` schema**, beside the users it notifies and the tables its
 * notifications are read from — which is the one exception to a schema per service, and why it has no
 * schema variable of its own. It sends email through SES, in the function's own region, as the
 * identity `mail/email.ts` creates — with the IAM that identity's link carries.
 */
export const notificatorEnvironment = {
  ...sharedEnvironment,
  OTEL_SERVICE_NAME: 'notificator',
  NOTIFICATOR_TRANSPORT: 'aws',
  NOTIFICATOR_QUEUE_URL: notificatorNotifications.url,
  POSTS_SCHEMA: 'posts',
  MAIL_TRANSPORT: 'ses',
  MAIL_FROM: mailFrom,
};

/**
 * **Who the seeders create**, from the root `.env` or the deploy's own environment:
 * `SEED_AUTHOR_EMAIL`, `SEED_AUTHOR_PASSWORD`, `SEED_AUTHOR_NAME` and the `SEED_PROMOTED_` and
 * `SEED_READER_` twins that `TestUsersSeeder` reads. Unset, it seeds its defaults.
 */
export const seedEnvironment: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[0].startsWith('SEED_') && entry[1] !== undefined,
  ),
);

/**
 * The migrator boots a Nest container per database, and the `posts` one carries the **real Better
 * Auth stack** — which is how `TestUsersSeeder` creates a credential instead of inserting a password
 * hash it made up. So it needs the same `AUTH_SECRET` as everything else that reads a session.
 */
export const migratorEnvironment = {
  ...sharedEnvironment,
  OTEL_SERVICE_NAME: 'migrator',
  POSTS_SCHEMA: 'posts',
  TAGGING_SCHEMA: 'tagging',
  AUTH_SECRET: authSecret.value,
  AUTH_URL: router.url,
  WEB_URL: router.url,
  ...seedEnvironment,
};

/** What every function is allowed to reach. The queues and the topic carry the IAM with them. */
export const links = [
  postEvents,
  taggingEvents,
  completed,
  notificatorNotifications,
  authSecret,
];
