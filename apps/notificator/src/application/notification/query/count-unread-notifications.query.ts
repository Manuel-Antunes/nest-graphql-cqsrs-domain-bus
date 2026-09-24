import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { NotificationRecordRepository } from '@nestposts/notifications/domain/notification/notification-record.repository';

export namespace CountUnreadNotificationsQuery {
  export class CountUnreadNotifications extends Query<number> {
    constructor(
      readonly notifiable: Pick<INotifiable, 'notifiableType' | 'notifiableId'>,
    ) {
      super();
    }
  }

  @QueryHandler(CountUnreadNotifications)
  export class Handler implements IQueryHandler<CountUnreadNotifications> {
    constructor(private readonly records: NotificationRecordRepository) {}

    execute({ notifiable }: CountUnreadNotifications): Promise<number> {
      return this.records.countUnread(
        notifiable.notifiableType,
        notifiable.notifiableId,
      );
    }
  }
}
