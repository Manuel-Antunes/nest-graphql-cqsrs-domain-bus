import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';

import { NotificationReceivedEvent } from './event/notification-received.event';
import type { Notification } from './notification';
import { NotificationRecipient } from './notification-recipient';

/**
 * What a notification is addressed to: a kind, an id, and where each channel reaches it.
 *
 * A {@link Notifiable} aggregate is one, and so is the {@link NotificationRecipient} snapshot taken of
 * it — which is what lets `via` run against the live aggregate and `toMail` against the snapshot, in
 * another process, with the same type.
 */
export interface INotifiable {
  readonly notifiableType: string;
  readonly notifiableId: string;
  readonly notifiableName: string | null;
  /** The address `channel` delivers to — an email for `email` — or `undefined` when it has none. */
  routeNotificationFor(channel: string): string | undefined;
}

/**
 * Makes an aggregate root something that can be notified.
 *
 * ```ts
 * export class User extends Notifiable(AggregateRoot(WithSoftDelete(BaseEntity))<UserEvent>) {
 *   override get notifiableType() { return 'users.User'; }
 *   override get notifiableId() { return this.id.value; }
 *   override get notifiableName() { return this.name.value; }
 *   override routeNotificationFor(channel: string) {
 *     return channel === EMAIL_CHANNEL ? this.email.value : undefined;
 *   }
 * }
 *
 * user.notify(new PostCreatedNotification(post, { url }));
 * user.commit();
 * ```
 *
 * `notify` decides nothing about delivery. It asks the notification which channels it goes through,
 * snapshots where each of them reaches this aggregate, addresses the notification's record to it and
 * raises {@link NotificationReceivedEvent} — which leaves with the aggregate's other events at
 * `commit()`, and which whoever delivers notifications acts on.
 *
 * It wraps the aggregate root — `Notifiable(AggregateRoot(...)<Events>)` — so that what it asks of
 * the host stays abstract in the final class, and the compiler holds the host to it.
 */
export function Notifiable<
  TBase extends abstract new (
    ...args: any[]
  ) => { apply(event: DomainEvent): void },
>(Base: TBase) {
  abstract class NotifiableEntity extends Base implements INotifiable {
    abstract get notifiableType(): string;
    abstract get notifiableId(): string;
    abstract get notifiableName(): string | null;
    abstract routeNotificationFor(channel: string): string | undefined;

    notify(notification: Notification, now: Date = new Date()): void {
      const channels = notification.channelsFor(this);
      notification.record.addressTo(this, now, notification.key);
      const recipient = NotificationRecipient.of(this, channels);
      this.apply(
        NotificationReceivedEvent.of(notification, recipient, channels, now),
      );
    }
  }
  return NotifiableEntity;
}
