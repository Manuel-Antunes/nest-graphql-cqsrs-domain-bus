/// <reference path="../../../.sst/platform/config.d.ts" />

import { StreamingFunction } from '../support';
import { notificator, posts } from './platform';

/**
 * GraphQL, Better Auth and everything else `apps/posts-api` serves — one function, answering as a
 * stream through a Function URL.
 */
/**
 * The SDL travels **beside** the bundle. `GraphQLModule` reads it from disk at boot —
 * `typePaths: [join(__dirname, 'graphql', '**' + '/*.graphql')]` — and the application's build copies
 * it into `dist/graphql` as an asset. A bundler has no reason to notice a `.graphql` file, so without
 * this the function starts, finds no types, and serves an empty schema.
 */
export const GRAPHQL_SDL = [
  { from: 'apps/posts-api/dist/graphql', to: 'graphql' },
];

/**
 * **The tenant migrations travel beside the bundle too.** A tenant's first request migrates its
 * schema from `join(__dirname, 'migrations', 'tenant')`, and the application's build emits one file
 * per migration there — each a `require` of the installed `@mikro-orm/migrations`, which is why that
 * package is installed and not bundled.
 */
export const tenantMigrationsOf = (application: string) => [
  { from: `apps/${application}/dist/migrations`, to: 'migrations' },
];

export const streaming = new StreamingFunction('PostsApi', {
  platform: posts,
  handler: 'apps/posts-api/dist/lambda/http.handler',
  memory: '2048 MB',
  copyFiles: [...GRAPHQL_SDL, ...tenantMigrationsOf('posts-api')],
});

/**
 * The notifications subgraph: the same build as the queue worker, answering HTTP instead —
 * GraphQL behind the gateway, where the worker drains the queue. Its SDL travels beside the bundle
 * for the same reason the posts subgraph's does.
 */
export const NOTIFICATIONS_SDL = [
  { from: 'apps/notificator/dist/graphql', to: 'graphql' },
];

export const notificationsSubgraph = new StreamingFunction('NotificatorApi', {
  platform: notificator,
  handler: 'apps/notificator/dist/lambda/http.handler',
  memory: '1024 MB',
  copyFiles: [...NOTIFICATIONS_SDL, ...tenantMigrationsOf('notificator')],
});
