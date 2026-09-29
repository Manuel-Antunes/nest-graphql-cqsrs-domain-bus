import { Injectable } from '@nestjs/common';
import type { IEventHandler } from '@nestjs/cqrs';
import { EventsHandler } from '@nestjs/cqrs';
import { CalendarEventCreatedEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-created.event';
import { CalendarEventDeletedEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-deleted.event';
import { CalendarEventRescheduledEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-rescheduled.event';
import { CalendarEventUpdatedEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-updated.event';
import type { CacheEntity } from '@nestposts/graphql-response-cache';
import { GraphQLResponseCache } from '@nestposts/graphql-response-cache';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostDeletedEvent } from '@nestposts/posts/domain/post/event/post-deleted.event';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { PostRestoredEvent } from '@nestposts/posts/domain/post/event/post-restored.event';
import { PostUpdatedEvent } from '@nestposts/posts/domain/post/event/post-updated.event';
import { ProcessingGroup } from '@nestposts/transport-eventbus';

export const RESPONSE_CACHE_GROUP = 'response-cache';

type CachedChange =
  | PostPreCreatedEvent
  | PostCreatedEvent
  | PostUpdatedEvent
  | PostDeletedEvent
  | PostRestoredEvent
  | CalendarEventCreatedEvent
  | CalendarEventUpdatedEvent
  | CalendarEventRescheduledEvent
  | CalendarEventDeletedEvent;

@Injectable()
@EventsHandler(
  PostPreCreatedEvent,
  PostCreatedEvent,
  PostUpdatedEvent,
  PostDeletedEvent,
  PostRestoredEvent,
  CalendarEventCreatedEvent,
  CalendarEventUpdatedEvent,
  CalendarEventRescheduledEvent,
  CalendarEventDeletedEvent,
)
@ProcessingGroup(RESPONSE_CACHE_GROUP)
export class ResponseCacheInvalidation implements IEventHandler<CachedChange> {
  private static readonly POST = 'Post';
  private static readonly EVENT = 'Event';

  constructor(private readonly responseCache: GraphQLResponseCache) {}

  static entitiesOf(change: CachedChange): CacheEntity[] {
    if (
      change instanceof PostCreatedEvent ||
      change instanceof PostUpdatedEvent
    ) {
      return [{ typename: ResponseCacheInvalidation.POST, id: change.postId }];
    }
    if (
      change instanceof PostPreCreatedEvent ||
      change instanceof PostDeletedEvent ||
      change instanceof PostRestoredEvent
    ) {
      return [{ typename: ResponseCacheInvalidation.POST }];
    }
    if (
      change instanceof CalendarEventUpdatedEvent ||
      change instanceof CalendarEventRescheduledEvent
    ) {
      return [
        {
          typename: ResponseCacheInvalidation.EVENT,
          id: change.calendarEventId,
        },
      ];
    }
    return [{ typename: ResponseCacheInvalidation.EVENT }];
  }

  handle(change: CachedChange): Promise<void> {
    return this.responseCache.invalidate(
      ResponseCacheInvalidation.entitiesOf(change),
    );
  }
}
