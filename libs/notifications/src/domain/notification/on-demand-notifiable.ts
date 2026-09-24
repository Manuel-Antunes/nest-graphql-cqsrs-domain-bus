import { AggregateRoot } from '@nestjs/cqrs';
import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';

import { UnroutableNotificationException } from './exception/unroutable-notification.exception';
import { Notifiable } from './notifiable';
import type { Notification } from './notification';

export const ON_DEMAND_NOTIFIABLE_TYPE = 'notifications.OnDemand';

/**
 * Someone known only by where to reach them — the address a sign-up is verified at, the email an
 * invitation goes to — and not by an aggregate of their own.
 *
 * ```ts
 * const recipient = OnDemandNotifiable.route(EMAIL_CHANNEL, 'ada@example.com', 'Ada');
 * await notifications.send(recipient, new PasswordResetNotification({ url }));
 * ```
 *
 * It is notified exactly as a {@link Notifiable} aggregate is, and raises the same
 * `NotificationReceivedEvent`. What it lacks is an identity to keep a record against, so it goes only
 * through the channels it was given a route for — `database` is never one — and `notify` refuses a
 * notification that asks for any other rather than dropping part of it quietly.
 *
 * Its id is its first route: a notification with a `key`, sent again to the same address, is the same
 * notification.
 */
export class OnDemandNotifiable extends Notifiable(AggregateRoot<DomainEvent>) {
  private constructor(
    private readonly routes: ReadonlyMap<string, string>,
    private readonly name: string | null,
  ) {
    super();
  }

  /** Someone reached through `channel` at `address`. */
  static route(
    channel: string,
    address: string,
    name: string | null = null,
  ): OnDemandNotifiable {
    return new OnDemandNotifiable(new Map([[channel, address]]), name);
  }

  /** The same person, reachable through one more channel. */
  route(channel: string, address: string): OnDemandNotifiable {
    return new OnDemandNotifiable(
      new Map([...this.routes, [channel, address]]),
      this.name,
    );
  }

  override get notifiableType(): string {
    return ON_DEMAND_NOTIFIABLE_TYPE;
  }

  override get notifiableId(): string {
    return this.routes.values().next().value as string;
  }

  override get notifiableName(): string | null {
    return this.name;
  }

  override routeNotificationFor(channel: string): string | undefined {
    return this.routes.get(channel);
  }

  override notify(notification: Notification, now: Date = new Date()): void {
    const unroutable = notification
      .channelsFor(this)
      .filter((channel) => !this.routes.has(channel));
    if (unroutable.length > 0) {
      throw new UnroutableNotificationException(notification.type, unroutable);
    }
    super.notify(notification, now);
  }
}
