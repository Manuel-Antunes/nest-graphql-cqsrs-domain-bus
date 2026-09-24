import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { NOTIFICATIONS_NAMESPACE } from '../../notifications.namespace';
import type { Notification } from '../notification';
import type { NotificationRecipient } from '../notification-recipient';
import type { NotificationData } from '../notification-record.entity';

export interface ReceivedRecipient {
  notifiableName: string | null;
  routes: Record<string, string>;
}

/**
 * A notifiable was notified: the notification's record, the channels it goes through and where each
 * of them reaches the notifiable. Everything a process that holds neither the aggregate nor the
 * notification needs to deliver it.
 */
@EventType({ namespace: NOTIFICATIONS_NAMESPACE, tags: ['notificationId'] })
export class NotificationReceivedEvent implements DomainEvent {
  constructor(
    readonly notificationId: string,
    readonly notificationType: string,
    readonly notifiableType: string,
    readonly notifiableId: string,
    readonly data: NotificationData,
    readonly channels: readonly string[],
    readonly recipient: ReceivedRecipient,
    readonly occurredAt: Date,
  ) {}

  static of(
    notification: Notification,
    recipient: NotificationRecipient,
    channels: readonly string[],
    now: Date,
  ): NotificationReceivedEvent {
    const { record } = notification;
    return new NotificationReceivedEvent(
      record.id.value,
      record.type,
      record.notifiableType,
      record.notifiableId,
      { ...record.data },
      [...channels],
      {
        notifiableName: recipient.notifiableName,
        routes: { ...recipient.routes },
      },
      now,
    );
  }
}
