import type { Cursor } from '@mikro-orm/core';
import type { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { CalendarEvent } from './calendar-event.entity';
import type { CalendarEventId } from './vo/calendar-event-id';

export interface CalendarRange {
  readonly from?: Date | null;
  readonly to?: Date | null;
  readonly teamId?: TeamId | null;
  readonly attendee?: UserId | null;
}

export interface CalendarPage {
  readonly first: number;
  readonly after?: string | null;
}

export abstract class CalendarEventRepository {
  abstract save(event: CalendarEvent): Promise<void>;
  abstract remove(event: CalendarEvent): Promise<void>;
  abstract findById(id: CalendarEventId): Promise<CalendarEvent | null>;

  abstract findOverlapping(
    range: CalendarRange,
    page: CalendarPage,
  ): Promise<Cursor<CalendarEvent>>;
}
