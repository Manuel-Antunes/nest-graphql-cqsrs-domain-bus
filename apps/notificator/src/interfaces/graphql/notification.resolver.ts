import { UseFilters } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { NotificationNotFoundException } from '@nestposts/notifications/domain/notification/exception/notification-not-found.exception';
import type { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';
import { NotificationId } from '@nestposts/notifications/domain/notification/vo/notification-id';

import { DeleteNotificationCommand } from '../../application/notification/command/delete-notification.command';
import { MarkAllNotificationsAsReadCommand } from '../../application/notification/command/mark-all-notifications-as-read.command';
import { MarkNotificationAsReadCommand } from '../../application/notification/command/mark-notification-as-read.command';
import { CountUnreadNotificationsQuery } from '../../application/notification/query/count-unread-notifications.query';
import { FindNotificationQuery } from '../../application/notification/query/find-notification.query';
import { FindNotificationsQuery } from '../../application/notification/query/find-notifications.query';
import { CurrentNotifiable } from '../auth/current-notifiable.decorator';
import type { SessionNotifiable } from '../auth/session-notifiable.pipe';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { NotificationExceptionFilter } from '../filters/notification-exception.filter';
import type { NotificationView } from './views';
import { notificationView } from './views';

@Resolver('Notification')
@UseFilters(HttpExceptionFilter, NotificationExceptionFilter)
export class NotificationResolver {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Query('notifications')
  async notifications(
    @CurrentNotifiable() reader: SessionNotifiable,
    @Args('unreadOnly') unreadOnly?: boolean | null,
    @Args('first') first?: number | null,
  ): Promise<NotificationView[]> {
    if (!reader) return [];
    const records = await this.queryBus.execute(
      new FindNotificationsQuery.FindNotifications(reader, {
        unreadOnly: unreadOnly ?? false,
        limit: first ?? undefined,
      }),
    );
    return records.map(notificationView);
  }

  @Query('notification')
  async notification(
    @Args('id') id: string,
    @CurrentNotifiable() reader: SessionNotifiable,
  ): Promise<NotificationView | null> {
    if (!reader) return null;
    const record = await this.queryBus.execute(
      new FindNotificationQuery.FindNotification(
        NotificationId.parse(id),
        reader,
      ),
    );
    return record ? notificationView(record) : null;
  }

  @Query('unreadNotificationCount')
  unreadNotificationCount(
    @CurrentNotifiable() reader: SessionNotifiable,
  ): Promise<number> {
    return reader
      ? this.queryBus.execute(
          new CountUnreadNotificationsQuery.CountUnreadNotifications(reader),
        )
      : Promise.resolve(0);
  }

  @Mutation('markNotificationAsRead')
  async markNotificationAsRead(
    @Args('id') id: string,
    @CurrentNotifiable() reader: SessionNotifiable,
  ): Promise<NotificationView> {
    const notificationId = NotificationId.parse(id);
    if (!reader) throw new NotificationNotFoundException(notificationId);
    await this.commandBus.execute(
      new MarkNotificationAsReadCommand.MarkNotificationAsRead(
        notificationId,
        reader,
      ),
    );
    const record: NotificationRecord | null = await this.queryBus.execute(
      new FindNotificationQuery.FindNotification(notificationId, reader),
    );
    if (!record) throw new NotificationNotFoundException(notificationId);
    return notificationView(record);
  }

  @Mutation('markAllNotificationsAsRead')
  markAllNotificationsAsRead(
    @CurrentNotifiable() reader: SessionNotifiable,
  ): Promise<number> {
    return reader
      ? this.commandBus.execute(
          new MarkAllNotificationsAsReadCommand.MarkAllNotificationsAsRead(
            reader,
          ),
        )
      : Promise.resolve(0);
  }

  @Mutation('deleteNotification')
  async deleteNotification(
    @Args('id') id: string,
    @CurrentNotifiable() reader: SessionNotifiable,
  ): Promise<string> {
    const notificationId = NotificationId.parse(id);
    if (!reader) throw new NotificationNotFoundException(notificationId);
    await this.commandBus.execute(
      new DeleteNotificationCommand.DeleteNotification(notificationId, reader),
    );
    return notificationId.value;
  }
}
