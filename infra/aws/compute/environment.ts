/// <reference path="../../../.sst/platform/config.d.ts" />

import { postgresUrl } from '../data';
import { router } from '../edge/router';
import { completed, postEvents, taggingEvents } from '../messaging';

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
  NODE_OPTIONS: '--experimental-require-module',
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
   * The local `EventBus` is one per container, and here there are several: the one that closes the
   * saga is the queue function, the one holding a subscription open is the HTTP one. `feed` points
   * the subscriptions at the shared log both of them write to — see `SubscriptionSource`.
   */
  POSTS_SUBSCRIPTION_SOURCE: 'feed',
  AUTH_SECRET: authSecret.value,
  AUTH_URL: router.url,
  WEB_URL: router.url,
  AUTH_TRUSTED_ORIGINS: router.url,
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
};

/** What every function is allowed to reach. The queues and the topic carry the IAM with them. */
export const links = [postEvents, taggingEvents, completed, authSecret];
