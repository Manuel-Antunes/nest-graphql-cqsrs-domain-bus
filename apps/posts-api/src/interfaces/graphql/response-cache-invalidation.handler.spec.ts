import { CalendarEventCreatedEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-created.event';
import { CalendarEventDeletedEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-deleted.event';
import { CalendarEventRescheduledEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-rescheduled.event';
import { CalendarEventUpdatedEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-updated.event';
import type { GraphQLResponseCache } from '@nestposts/graphql-response-cache';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostDeletedEvent } from '@nestposts/posts/domain/post/event/post-deleted.event';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { PostRestoredEvent } from '@nestposts/posts/domain/post/event/post-restored.event';
import { PostUpdatedEvent } from '@nestposts/posts/domain/post/event/post-updated.event';

import { ResponseCacheInvalidation } from './response-cache-invalidation.handler';

const an = <T extends object>(
  type: abstract new (...args: never[]) => T,
  fields: Partial<T>,
): T => Object.assign(Object.create(type.prototype) as T, fields);

describe('ResponseCacheInvalidation', () => {
  it('forgets the one post a completion or an edit changed', () => {
    for (const change of [
      an(PostCreatedEvent, { postId: 'p-1' }),
      an(PostUpdatedEvent, { postId: 'p-1' }),
    ]) {
      expect(ResponseCacheInvalidation.entitiesOf(change)).toEqual([
        { typename: 'Post', id: 'p-1' },
      ]);
    }
  });

  it('forgets every response with a post when one appears, disappears or comes back', () => {
    for (const change of [
      an(PostPreCreatedEvent, { postId: 'p-1' }),
      an(PostDeletedEvent, { postId: 'p-1' }),
      an(PostRestoredEvent, { postId: 'p-1' }),
    ]) {
      expect(ResponseCacheInvalidation.entitiesOf(change)).toEqual([
        { typename: 'Post' },
      ]);
    }
  });

  it('forgets the one event a revision or a reschedule changed', () => {
    for (const change of [
      an(CalendarEventUpdatedEvent, { calendarEventId: 'e-1' }),
      an(CalendarEventRescheduledEvent, { calendarEventId: 'e-1' }),
    ]) {
      expect(ResponseCacheInvalidation.entitiesOf(change)).toEqual([
        { typename: 'Event', id: 'e-1' },
      ]);
    }
  });

  it('forgets every response with an event when one appears or disappears', () => {
    for (const change of [
      an(CalendarEventCreatedEvent, { calendarEventId: 'e-1' }),
      an(CalendarEventDeletedEvent, { calendarEventId: 'e-1' }),
    ]) {
      expect(ResponseCacheInvalidation.entitiesOf(change)).toEqual([
        { typename: 'Event' },
      ]);
    }
  });

  it('hands what it forgets to the response cache', async () => {
    const invalidate = vi.fn().mockResolvedValue(undefined);
    const handler = new ResponseCacheInvalidation({
      invalidate,
    } as unknown as GraphQLResponseCache);

    await handler.handle(an(PostUpdatedEvent, { postId: 'p-9' }));

    expect(invalidate).toHaveBeenCalledWith([{ typename: 'Post', id: 'p-9' }]);
  });
});
