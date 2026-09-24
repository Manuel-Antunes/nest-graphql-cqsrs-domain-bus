/// <reference path="../../../.sst/platform/config.d.ts" />

import { SnsFilterPolicy } from '../../../libs/core/transport-eventbus/src/aws/sns-filter-policy';
import { NOTIFICATIONS_NAMESPACE } from '../../../libs/notifications/src/domain/notifications.namespace';
import { POSTS_NAMESPACE } from '../../../libs/posts/src/domain/post/event/posts.namespace';
import { completed, notificatorNotifications, taggingEvents } from './queues';
import { postEvents } from './topic';

/**
 * **The bindings.** A subscription's filter policy is what a RabbitMQ binding was, and it is built
 * from the same place `@EventPattern` is: `SnsFilterPolicy`, imported from the library rather than
 * written out here, so a namespace or an event renamed in `@EventType` takes its subscriptions with
 * it instead of leaving a queue quietly bound to a name nothing publishes under any more.
 *
 * **`rawMessageDelivery` is not optional.** Without it SNS wraps every message in a notification of
 * its own and the message attributes never reach SQS — which is the only thing a filter policy can
 * read, so the filters stop filtering and every queue receives everything. The deserializer unwraps
 * the notification anyway, which is exactly what makes the mistake invisible.
 */
const raw = { subscription: { rawMessageDelivery: true } };

/**
 * The whole namespace, because `apps/tagging` keeps the Post's entire stream: a decision taken
 * against half a history is a wrong decision, and one queue is what keeps those events ordered
 * against each other — see `queues.ts`.
 */
postEvents.subscribeQueue('TaggingEvents', taggingEvents.arn, {
  filter: {
    ...SnsFilterPolicy.everyEventOf(POSTS_NAMESPACE),
    ...SnsFilterPolicy.exceptFrom('tagging'),
  },
  transform: raw,
});

/**
 * One event type, and `exceptFrom('posts-api')` earns its place here: a post created **with** tags
 * goes through both phases in one unit of work, so `posts-api` publishes `PostCreated` itself.
 * Without this the queue that exists to hear tagging's decision would also hear the service's own
 * echo — the origin mark would drop it, after it had been stored, delivered and deserialized.
 */
postEvents.subscribeQueue('Completed', completed.arn, {
  filter: {
    ...SnsFilterPolicy.everyEventNamed('posts.PostCreated'),
    ...SnsFilterPolicy.exceptFrom('posts-api'),
  },
  transform: raw,
});

/**
 * What a notifiable was told, for `apps/notificator` to deliver. It publishes nothing, so there is no
 * echo of its own to exclude.
 */
postEvents.subscribeQueue('NotificatorEvents', notificatorNotifications.arn, {
  filter: SnsFilterPolicy.everyEventNamed(
    `${NOTIFICATIONS_NAMESPACE}.NotificationReceived`,
  ),
  transform: raw,
});
