/// <reference path="../../../.sst/platform/config.d.ts" />

import { completed, taggingEvents } from '../messaging';
import { QueueWorker } from '../support';
import { GRAPHQL_SDL } from './api';
import { posts, tagging } from './platform';

/**
 * **One function per queue, and there are two queues** — see `messaging/queues.ts` for why
 * `apps/tagging` is one and not the two its two jobs would suggest.
 *
 * Which job runs is decided by what arrives: the controller binds the namespace, the saga only fires
 * on `PostPreCreated`, and everything else is appended to the stream and reacted to by nobody.
 */
export const taggingWorker = new QueueWorker('Tagging', {
  platform: tagging,
  handler: 'apps/tagging/dist/lambda/sqs.handler',
  queue: taggingEvents,
  timeout: '2 minutes',
});

/**
 * The saga coming back. It is the **same bundle** as the HTTP function — one `nest build`, two
 * handlers — because nothing in Node forces the split that a Quarkus classpath would: one artifact
 * means the projection that runs here cannot drift from the read model the API serves.
 */
export const postsInbox = new QueueWorker('PostsApiInbox', {
  platform: posts,
  handler: 'apps/posts-api/dist/lambda/sqs.handler',
  queue: completed,
  timeout: '2 minutes',
  copyFiles: GRAPHQL_SDL,
});
