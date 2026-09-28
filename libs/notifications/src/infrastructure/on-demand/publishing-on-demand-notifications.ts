import { Injectable, Optional } from '@nestjs/common';
import { EventPublisher } from '@nestjs/cqrs';
import {
  SimpleUnitOfWorkFactory,
  UnitOfWorkFactory,
} from '@nestposts/transport-eventbus/unit-of-work/unit-of-work-factory';

import type { Notification } from '../../domain/notification/notification';
import type { OnDemandNotifiable } from '../../domain/notification/on-demand-notifiable';
import { OnDemandNotifications } from '../../domain/notification/on-demand-notifications';

/**
 * Sends through whatever the application's `EventPublisher` is — the transport publisher, where
 * `CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER })` made it one — so the
 * `NotificationReceivedEvent` leaves for the process that delivers notifications.
 *
 * The notify and the commit run in a unit of work of their own: the publish is staged, written to the
 * outbox in its `PREPARE_COMMIT`, and `send` resolves only once that committed. Called from inside
 * another unit — a Better Auth callback during a command — it is still a unit of its own, which joins
 * that unit's transaction.
 */
@Injectable()
export class PublishingOnDemandNotifications extends OnDemandNotifications {
  private readonly units: UnitOfWorkFactory;

  constructor(
    private readonly publisher: EventPublisher,
    @Optional() units?: UnitOfWorkFactory,
  ) {
    super();
    this.units = units ?? new SimpleUnitOfWorkFactory();
  }

  async send(
    notifiable: OnDemandNotifiable,
    notification: Notification,
    now: Date = new Date(),
  ): Promise<void> {
    await this.units.create().executeWithResult(async () => {
      const addressed = this.publisher.mergeObjectContext(notifiable);
      addressed.notify(notification, now);
      addressed.commit();
    });
  }
}
