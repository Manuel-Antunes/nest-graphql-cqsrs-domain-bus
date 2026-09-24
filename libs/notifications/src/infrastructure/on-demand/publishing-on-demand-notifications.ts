import { Injectable } from '@nestjs/common';
import { EventPublisher } from '@nestjs/cqrs';
import { UnitOfWork } from '@nestposts/cqsrs';

import type { Notification } from '../../domain/notification/notification';
import type { OnDemandNotifiable } from '../../domain/notification/on-demand-notifiable';
import { OnDemandNotifications } from '../../domain/notification/on-demand-notifications';

/**
 * Sends through whatever the application's `EventPublisher` is — the transport publisher, where
 * `CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER })` made it one — so the
 * `NotificationReceivedEvent` leaves for the process that delivers notifications.
 *
 * The notify and the commit run inside a unit of work: the publish is staged and sent at its commit,
 * and `send` resolves only once that is done. Called from inside a unit that is already open, it joins
 * it instead, and goes out with the rest of that unit's events.
 */
@Injectable()
export class PublishingOnDemandNotifications extends OnDemandNotifications {
  constructor(private readonly publisher: EventPublisher) {
    super();
  }

  async send(
    notifiable: OnDemandNotifiable,
    notification: Notification,
    now: Date = new Date(),
  ): Promise<void> {
    await UnitOfWork.run(async () => {
      const addressed = this.publisher.mergeObjectContext(notifiable);
      addressed.notify(notification, now);
      addressed.commit();
    });
  }
}
