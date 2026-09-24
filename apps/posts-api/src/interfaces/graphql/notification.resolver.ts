import { MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { NotificationNotFoundException } from '@nestposts/notifications/domain/notification/exception/notification-not-found.exception';
import { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';
import { NotificationId } from '@nestposts/notifications/domain/notification/vo/notification-id';
import type { User } from '@nestposts/users/domain/user/user.entity';

import { MarkNotificationAsReadCommand } from '../../application/notification/command/mark-notification-as-read.command';
import { FindNotificationQuery } from '../../application/notification/query/find-notification.query';
import { FindNotificationsQuery } from '../../application/notification/query/find-notifications.query';
import { NotificationView } from '../../dto/graphql/notification.view';
import { CurrentUser } from '../decorators/current-user.decorator';

@Resolver('Notification')
export class NotificationResolver {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Query('notifications')
  @UseInterceptors(
    MapInterceptor(NotificationRecord, NotificationView, { isArray: true }),
  )
  notifications(
    @CurrentUser() user: User,
    @Args('unreadOnly') unreadOnly?: boolean | null,
    @Args('first') first?: number | null,
  ): Promise<NotificationRecord[]> {
    return this.queryBus.execute(
      new FindNotificationsQuery.FindNotifications(user, {
        unreadOnly: unreadOnly ?? false,
        limit: first ?? undefined,
      }),
    );
  }

  @Query('notification')
  @UseInterceptors(MapInterceptor(NotificationRecord, NotificationView))
  notification(
    @Args('id') id: string,
    @CurrentUser() user: User,
  ): Promise<NotificationRecord | null> {
    return this.queryBus.execute(
      new FindNotificationQuery.FindNotification(
        NotificationId.parse(id),
        user,
      ),
    );
  }

  @Mutation('markNotificationAsRead')
  @UseInterceptors(MapInterceptor(NotificationRecord, NotificationView))
  async markNotificationAsRead(
    @Args('id') id: string,
    @CurrentUser() user: User,
  ): Promise<NotificationRecord> {
    const notificationId = NotificationId.parse(id);
    await this.commandBus.execute(
      new MarkNotificationAsReadCommand.MarkNotificationAsRead(
        notificationId,
        user,
      ),
    );
    const record = await this.queryBus.execute(
      new FindNotificationQuery.FindNotification(notificationId, user),
    );
    if (!record) throw new NotificationNotFoundException(notificationId);
    return record;
  }
}
