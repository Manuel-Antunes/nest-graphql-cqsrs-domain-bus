/// <reference path="../../../.sst/platform/config.d.ts" />

import { StreamingFunction } from '../support';
import { posts } from './platform';

/**
 * GraphQL, Better Auth and everything else `apps/posts-api` serves — one function, answering as a
 * stream through a Function URL.
 */
/**
 * The SDL travels **beside** the bundle. `GraphQLModule` reads it from disk at boot —
 * `typePaths: [join(__dirname, 'graphql', '**' + '/*.graphql')]` — and `nest build` copies it into
 * `dist/graphql` as an asset. A bundler has no reason to notice a `.graphql` file, so without this
 * the function starts, finds no types, and serves an empty schema.
 */
export const GRAPHQL_SDL = [
  { from: 'apps/posts-api/dist/graphql', to: 'graphql' },
];

export const streaming = new StreamingFunction('PostsApi', {
  platform: posts,
  handler: 'apps/posts-api/dist/lambda/http.handler',
  memory: '2048 MB',
  copyFiles: GRAPHQL_SDL,
});
