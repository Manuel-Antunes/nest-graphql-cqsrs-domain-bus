import type { Cursor } from '@mikro-orm/core';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '@nestposts/auth/decorators/current-user.decorator';
import { CurrentTenant } from '@nestposts/database';
import { CalendarEvent } from '@nestposts/events/domain/calendar-event/calendar-event.entity';
import { SeesEveryEventPipe } from '@nestposts/events/pipes/sees-every-event.pipe';
import { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';
import type { User } from '@nestposts/users/domain/user/user.entity';

import { FindCalendarEventsQuery } from '../../application/calendar-event/query/find-calendar-events.query';
import { CalendarEventView } from '../../dto/graphql/calendar-event.view';
import { ConnectionInterceptor } from '../interceptors/connection.interceptor';

interface EventRange {
  readonly from?: Date | null;
  readonly to?: Date | null;
}

@Resolver('Event')
export class CalendarEventQueryResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @Query('events')
  @UseInterceptors(ConnectionInterceptor(CalendarEvent, CalendarEventView))
  events(
    @CurrentUser() user: User,
    @CurrentTenant(SeesEveryEventPipe) seesEverything: boolean,
    @Args('range') range?: EventRange | null,
    @Args('teamId') teamId?: string | null,
    @Args('first') first?: number | null,
    @Args('after') after?: string | null,
  ): Promise<Cursor<CalendarEvent>> {
    return this.queryBus.execute(
      new FindCalendarEventsQuery.FindCalendarEvents(
        { userId: user.id, seesEverything },
        {
          from: range?.from,
          to: range?.to,
          teamId: teamId ? TeamId.parse(teamId) : null,
        },
        first,
        after,
      ),
    );
  }
}
