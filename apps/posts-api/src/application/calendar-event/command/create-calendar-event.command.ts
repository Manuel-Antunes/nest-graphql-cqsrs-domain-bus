import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { CalendarEvent } from '@nestposts/events/domain/calendar-event/calendar-event.entity';
import { CalendarEventRepository } from '@nestposts/events/domain/calendar-event/calendar-event.repository';
import type { CalendarEventDetails } from '@nestposts/events/domain/calendar-event/vo/calendar-event-details';
import type { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import type { CalendarEventWindow } from '@nestposts/events/domain/calendar-event/vo/calendar-event-window';
import type { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { CalendarAttendees } from '../calendar-attendees.service';
import { CalendarEventRequest } from '../calendar-event-request';

export namespace CreateCalendarEventCommand {
  export interface NewEvent {
    readonly details: CalendarEventDetails;
    readonly window: CalendarEventWindow;
    readonly responsibleId: UserId;
    readonly participantIds?: readonly UserId[];
    readonly teamId?: TeamId | null;
  }

  export class CreateCalendarEvent extends Command<CalendarEventId> {
    constructor(
      readonly calendarEventId: CalendarEventId,
      readonly event: NewEvent,
    ) {
      super();
    }
  }

  @CommandHandler(CreateCalendarEvent, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<CreateCalendarEvent> {
    constructor(
      private readonly events: CalendarEventRepository,
      private readonly attendees: CalendarAttendees,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: CalendarEventRequest,
    ) {}

    async execute({
      calendarEventId,
      event,
    }: CreateCalendarEvent): Promise<CalendarEventId> {
      const responsible = await this.attendees.user(event.responsibleId);
      const team = event.teamId
        ? await this.attendees.team(event.teamId, this.request.tenantId)
        : null;
      const participants = [
        ...(await this.attendees.usersOf(event.participantIds ?? [])),
        ...(team ? await this.attendees.membersOf(team) : []),
      ];
      const scheduled = this.publisher.mergeObjectContext(
        CalendarEvent.schedule(
          calendarEventId,
          event.details,
          event.window,
          { responsible, participants, team },
          new Date(),
        ),
        this.request,
      );
      await this.events.save(scheduled);
      scheduled.commit();
      return scheduled.id;
    }
  }
}
