import type { Cursor } from '@mikro-orm/core';
import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { CalendarEvent } from '@nestposts/events/domain/calendar-event/calendar-event.entity';
import { CalendarEventRepository } from '@nestposts/events/domain/calendar-event/calendar-event.repository';
import type { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';

import type { CalendarViewer } from './calendar-viewer';

export namespace FindCalendarEventsQuery {
  export const DEFAULT_PAGE_SIZE = 500;
  export const MAX_PAGE_SIZE = 500;

  export interface Range {
    readonly from?: Date | null;
    readonly to?: Date | null;
    readonly teamId?: TeamId | null;
  }

  export class FindCalendarEvents extends Query<Cursor<CalendarEvent>> {
    readonly first: number;

    constructor(
      readonly viewer: CalendarViewer,
      readonly range: Range = {},
      first?: number | null,
      readonly after?: string | null,
    ) {
      super();
      this.first = Math.min(
        Math.max(first ?? DEFAULT_PAGE_SIZE, 1),
        MAX_PAGE_SIZE,
      );
    }
  }

  @QueryHandler(FindCalendarEvents)
  export class Handler implements IQueryHandler<FindCalendarEvents> {
    constructor(private readonly events: CalendarEventRepository) {}

    execute({
      viewer,
      range,
      first,
      after,
    }: FindCalendarEvents): Promise<Cursor<CalendarEvent>> {
      return this.events.findOverlapping(
        { ...range, attendee: viewer.seesEverything ? null : viewer.userId },
        { first, after },
      );
    }
  }
}
