import type { Mapper } from '@automapper/core';
import { InjectMapper, MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '@nestposts/auth/decorators/current-user.decorator';
import { CurrentTenant } from '@nestposts/database';
import { CalendarEvent } from '@nestposts/events/domain/calendar-event/calendar-event.entity';
import { CalendarEventNotFoundException } from '@nestposts/events/domain/calendar-event/exception/calendar-event-not-found.exception';
import { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import { MemberCan } from '@nestposts/organizations/decorators/org-roles.decorator';
import { EVENT_RESOURCE } from '@nestposts/organizations/infrastructure/better-auth/access';
import type { User } from '@nestposts/users/domain/user/user.entity';

import { CalendarEventRequest } from '../../application/calendar-event/calendar-event-request';
import { CreateCalendarEventCommand } from '../../application/calendar-event/command/create-calendar-event.command';
import { DeleteCalendarEventCommand } from '../../application/calendar-event/command/delete-calendar-event.command';
import { UpdateCalendarEventCommand } from '../../application/calendar-event/command/update-calendar-event.command';
import { FindCalendarEventQuery } from '../../application/calendar-event/query/find-calendar-event.query';
import {
  CreateEventInput,
  CreateMyEventInput,
  UpdateEventInput,
} from '../../dto/graphql/calendar-event.input';
import { CalendarEventView } from '../../dto/graphql/calendar-event.view';

@Resolver('Event')
export class CalendarEventMutationResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @InjectMapper() private readonly mapper: Mapper,
  ) {}

  @Mutation('createEvent')
  @MemberCan({ permissions: { [EVENT_RESOURCE]: ['create'] } })
  @UseInterceptors(MapInterceptor(CalendarEvent, CalendarEventView))
  async createEvent(
    @Args('input') input: CreateEventInput,
    @CurrentTenant() tenantId: string,
  ): Promise<CalendarEvent> {
    return this.create(
      await this.mapper.mapAsync(
        input,
        CreateEventInput,
        CreateCalendarEventCommand.CreateCalendarEvent,
      ),
      tenantId,
    );
  }

  @Mutation('createMyEvent')
  @UseInterceptors(MapInterceptor(CalendarEvent, CalendarEventView))
  async createMyEvent(
    @Args('input') input: CreateMyEventInput,
    @CurrentUser() responsible: User,
    @CurrentTenant() tenantId: string,
  ): Promise<CalendarEvent> {
    return this.create(
      await this.mapper.mapAsync(
        input,
        CreateMyEventInput,
        CreateCalendarEventCommand.CreateCalendarEvent,
        { extraArgs: () => ({ responsible }) },
      ),
      tenantId,
    );
  }

  @Mutation('updateEvent')
  @MemberCan({ permissions: { [EVENT_RESOURCE]: ['update'] } })
  @UseInterceptors(MapInterceptor(CalendarEvent, CalendarEventView))
  async updateEvent(
    @Args('input') input: UpdateEventInput,
    @CurrentTenant() tenantId: string,
  ): Promise<CalendarEvent> {
    const command = await this.mapper.mapAsync(
      input,
      UpdateEventInput,
      UpdateCalendarEventCommand.UpdateCalendarEvent,
    );
    await this.commandBus.execute(
      command,
      new CalendarEventRequest(command.calendarEventId, tenantId),
    );
    return this.saved(command.calendarEventId);
  }

  @Mutation('deleteEvent')
  @MemberCan({ permissions: { [EVENT_RESOURCE]: ['delete'] } })
  async deleteEvent(
    @Args('id') id: string,
    @CurrentTenant() tenantId: string,
  ): Promise<boolean> {
    const calendarEventId = CalendarEventId.parse(id);
    await this.commandBus.execute(
      new DeleteCalendarEventCommand.DeleteCalendarEvent(calendarEventId),
      new CalendarEventRequest(calendarEventId, tenantId),
    );
    return true;
  }

  private async create(
    command: CreateCalendarEventCommand.CreateCalendarEvent,
    tenantId: string,
  ): Promise<CalendarEvent> {
    const calendarEventId = await this.commandBus.execute(
      command,
      new CalendarEventRequest(command.calendarEventId, tenantId),
    );
    return this.saved(calendarEventId);
  }

  private async saved(
    calendarEventId: CalendarEventId,
  ): Promise<CalendarEvent> {
    const event = await this.queryBus.execute(
      new FindCalendarEventQuery.FindCalendarEvent(calendarEventId),
    );
    if (!event) {
      throw new CalendarEventNotFoundException(calendarEventId);
    }
    return event;
  }
}
