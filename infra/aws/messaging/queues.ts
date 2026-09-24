/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * **One queue per consuming service, and for `apps/tagging` that is not a simplification — it is
 * what makes ordering exist.**
 *
 * The obvious shape is a queue per slice of the flow: one for the `PostPreCreated` that starts the
 * decision and one for the updates that only get replicated, each with its own function, its own
 * dead-letter queue and its own concurrency. It was built that way and then measured, and the
 * measurement is why it is not that way now:
 *
 * ```
 * inbox ← posts.PostUpdated      from 'posts-api'
 * inbox ← posts.PostPreCreated   from 'posts-api'
 * ERROR  failed to ingest PostUpdatedEvent; it will be REJECTED
 *        duplicate key value violates unique constraint "event_log_pkey"
 *        Key (stream_id, sequence)=(f126e059-…, 0) already exists.
 * ```
 *
 * **SQS FIFO orders messages within a queue, not between queues.** `apps/tagging` event-sources the
 * Post — it reads the stream, lets the aggregate decide, and appends at the next sequence — so two
 * events of one post arriving through two queues are two appends racing for the same position. The
 * store refuses and SQS redelivers, so it converges; the cost is a rejected message, a message group
 * held for a visibility timeout, and a dead-letter queue that fills under load.
 *
 * So `apps/tagging` gets **one** queue and the whole namespace, which is also what its controller
 * already binds (`EventAddress.everyEventOf(POSTS_NAMESPACE)`). `apps/posts-api` keeps its own: it is
 * a different service with a different inbox, and it projects onto a row rather than appending to
 * that stream.
 *
 * `retry: 5` counts **deliveries**, not retries: the first attempt and four redeliveries, and then
 * the message is somebody's problem instead of an endless one. The dead-letter queue of a FIFO queue
 * has to be FIFO too.
 */
function queue(name: string) {
  const dlq = new sst.aws.Queue(`${name}Dlq`, { fifo: true });

  return new sst.aws.Queue(name, {
    fifo: true,
    visibilityTimeout: '180 seconds',
    dlq: { queue: dlq.arn, retry: 5 },
  });
}

export const taggingEvents = queue('TaggingPostEvents');

export const completed = queue('PostsApiCompleted');

export const notificatorNotifications = queue('NotificatorNotifications');
