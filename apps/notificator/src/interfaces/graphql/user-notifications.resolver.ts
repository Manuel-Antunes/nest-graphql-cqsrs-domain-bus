import { UseFilters } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Args,
  Parent,
  ResolveField,
  ResolveReference,
  Resolver,
} from '@nestjs/graphql';
import { AllowAnonymous, OptionalAuth } from '@thallesp/nestjs-better-auth';

import { CountUnreadNotificationsQuery } from '../../application/notification/query/count-unread-notifications.query';
import { FindNotificationsQuery } from '../../application/notification/query/find-notifications.query';
import { CurrentNotifiable } from '../auth/current-notifiable.decorator';
import type { SessionNotifiable } from '../auth/session-notifiable.pipe';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import type { NotificationView } from './views';
import { notificationView } from './views';

interface UserReference {
  id: string;
}

const isTheReader = (user: UserReference, reader: SessionNotifiable) =>
  reader !== null && reader.notifiableId === user.id;

@Resolver('IUser')
@UseFilters(HttpExceptionFilter)
export class UserNotificationsResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveReference()
  @AllowAnonymous()
  resolveReference(reference: UserReference): UserReference {
    return { id: reference.id };
  }

  @ResolveField('notifications')
  @OptionalAuth()
  async notifications(
    @Parent() user: UserReference,
    @CurrentNotifiable() reader: SessionNotifiable,
    @Args('unreadOnly') unreadOnly?: boolean | null,
    @Args('first') first?: number | null,
  ): Promise<NotificationView[]> {
    if (!reader || !isTheReader(user, reader)) return [];
    const records = await this.queryBus.execute(
      new FindNotificationsQuery.FindNotifications(reader, {
        unreadOnly: unreadOnly ?? false,
        limit: first ?? undefined,
      }),
    );
    return records.map(notificationView);
  }

  @ResolveField('unreadNotificationCount')
  @OptionalAuth()
  unreadNotificationCount(
    @Parent() user: UserReference,
    @CurrentNotifiable() reader: SessionNotifiable,
  ): Promise<number> {
    return reader && isTheReader(user, reader)
      ? this.queryBus.execute(
          new CountUnreadNotificationsQuery.CountUnreadNotifications(reader),
        )
      : Promise.resolve(0);
  }
}
