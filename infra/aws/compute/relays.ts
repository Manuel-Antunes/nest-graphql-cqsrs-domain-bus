/// <reference path="../../../.sst/platform/config.d.ts" />

import { NodeFunction } from '../support';
import { GRAPHQL_SDL, tenantMigrationsOf } from './api';
import { posts, tagging } from './platform';

const EVERY_MINUTE = 'rate(1 minute)';

export const postsRelay = new NodeFunction('PostsApiRelay', {
  platform: posts,
  handler: 'apps/posts-api/dist/lambda/relay.handler',
  timeout: '1 minute',
  copyFiles: [...GRAPHQL_SDL, ...tenantMigrationsOf('posts-api')],
});

export const taggingRelay = new NodeFunction('TaggingRelay', {
  platform: tagging,
  handler: 'apps/tagging/dist/lambda/relay.handler',
  timeout: '1 minute',
  copyFiles: tenantMigrationsOf('tagging'),
});

new sst.aws.Cron('PostsApiRelaySchedule', {
  schedule: EVERY_MINUTE,
  function: postsRelay.fn,
});

new sst.aws.Cron('TaggingRelaySchedule', {
  schedule: EVERY_MINUTE,
  function: taggingRelay.fn,
});
