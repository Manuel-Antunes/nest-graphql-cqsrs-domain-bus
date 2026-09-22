/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * **The exchange, translated — and FIFO is not tuning.**
 *
 * `apps/tagging` event-sources the Post: it reads the stream, lets the aggregate decide, and appends.
 * The position of an append comes from having read the stream first, so a `PostUpdated` that
 * overtakes the `PostPreCreated` of the same post makes the next append land on a sequence that is
 * already taken. On a standard topic this saga does not work — not "works worse": it breaks,
 * intermittently and in proportion to load.
 *
 * What makes ordering exist is the `MessageGroupId`, and it already existed: `SnsClientProxy` sends
 * the event's **aggregate** (the last segment of the routing key), so two events of one post are
 * ordered against each other while different posts go in parallel. `MessageDeduplicationId` is the
 * envelope's identifier, which is why content-based deduplication stays off.
 */
export const postEvents = new sst.aws.SnsTopic('PostEvents', { fifo: true });
