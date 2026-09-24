/// <reference path="../../.sst/platform/config.d.ts" />

/**
 * **The facade: load order and outputs. It creates nothing.**
 *
 * The order is the dependency order, and it is the one thing this file decides — `messaging/` before
 * `compute/` because a function is linked to the queue it reads, `compute/` before `edge/` because a
 * route points at a function's URL, and `web/` last because it is the only thing that wants all
 * three.
 */
import {
  gateway,
  migrator,
  notificationsSubgraph,
  notificatorWorker,
  postsInbox,
  seeder,
  streaming,
  taggingWorker,
} from './compute';
import { database } from './data';
import { router } from './edge';
import { mailSender } from './mail';
import {
  completed,
  notificatorNotifications,
  postEvents,
  taggingEvents,
} from './messaging';
import { bucket, filesUrl } from './storage';
import { web } from './web';

export const outputs = {
  url: router.url,

  graphql: $interpolate`${router.url}/graphql`,

  stream: streaming.url,

  gateway: gateway.url,

  notificationsSubgraph: notificationsSubgraph.url,

  web: web.url,

  migrate: migrator.functionName,

  seed: seeder.functionName,

  workers: {
    tagging: taggingWorker.functionName,
    postsInbox: postsInbox.functionName,
    notificator: notificatorWorker.functionName,
  },

  files: filesUrl,

  bucket: bucket.name,

  topic: postEvents.arn,

  queues: {
    tagging: taggingEvents.url,
    completed: completed.url,
    notificator: notificatorNotifications.url,
  },

  mailSender,

  database: database.host,
};
