import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import type { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';
import type { NotificationPage } from '@nestposts/notifications/domain/notification/notification-record.repository';
import { NotificationRecordRepository } from '@nestposts/notifications/domain/notification/notification-record.repository';

export namespace FindNotificationsQuery {
  export class FindNotifications extends Query<NotificationRecord[]> {
    constructor(
      readonly notifiable: Pick<INotifiable, 'notifiableType' | 'notifiableId'>,
      readonly page: NotificationPage = {},
    ) {
      super();
    }
  }

  @QueryHandler(FindNotifications)
  export class Handler implements IQueryHandler<FindNotifications> {
    constructor(private readonly records: NotificationRecordRepository) {}

    execute({
      notifiable,
      page,
    }: FindNotifications): Promise<NotificationRecord[]> {
      return this.records.findByNotifiable(
        notifiable.notifiableType,
        notifiable.notifiableId,
        page,
      );
    }
  }
}
