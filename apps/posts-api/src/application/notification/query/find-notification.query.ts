import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import type { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';
import { NotificationRecordRepository } from '@nestposts/notifications/domain/notification/notification-record.repository';
import type { NotificationId } from '@nestposts/notifications/domain/notification/vo/notification-id';

export namespace FindNotificationQuery {
  export class FindNotification extends Query<NotificationRecord | null> {
    constructor(
      readonly notificationId: NotificationId,
      readonly notifiable: Pick<INotifiable, 'notifiableType' | 'notifiableId'>,
    ) {
      super();
    }
  }

  @QueryHandler(FindNotification)
  export class Handler implements IQueryHandler<FindNotification> {
    constructor(private readonly records: NotificationRecordRepository) {}

    async execute({
      notificationId,
      notifiable,
    }: FindNotification): Promise<NotificationRecord | null> {
      const record = await this.records.findById(notificationId);
      return record?.isAddressedTo(
        notifiable.notifiableType,
        notifiable.notifiableId,
      )
        ? record
        : null;
    }
  }
}
