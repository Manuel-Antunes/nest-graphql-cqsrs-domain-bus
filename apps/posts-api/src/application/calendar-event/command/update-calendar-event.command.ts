import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import type { CalendarEvent } from '@nestposts/events/domain/calendar-event/calendar-event.entity';
import { CalendarEventRepository } from '@nestposts/events/domain/calendar-event/calendar-event.repository';
import { CalendarEventNotFoundException } from '@nestposts/events/domain/calendar-event/exception/calendar-event-not-found.exception';
import type { CalendarEventDetailsChanges } from '@nestposts/events/domain/calendar-event/vo/calendar-event-details';
import type { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import type { CalendarEventWindowChanges } from '@nestposts/events/domain/calendar-event/vo/calendar-event-window';
import type { Team } from '@nestposts/organizations/domain/organization/team.entity';
import type { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';
import type { User } from '@nestposts/users/domain/user/user.entity';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { CalendarAttendees } from '../calendar-attendees.service';
import { CalendarEventRequest } from '../calendar-event-request';

export namespace UpdateCalendarEventCommand {
  export interface Changes {
    readonly details?: CalendarEventDetailsChanges;
    readonly window?: CalendarEventWindowChanges;
    readonly responsibleId?: UserId | null;
    readonly participantIds?: readonly UserId[] | null;
    readonly teamId?: TeamId | null;
  }

  export class UpdateCalendarEvent extends Command<void> {
    constructor(
      readonly calendarEventId: CalendarEventId,
      readonly changes: Changes,
    ) {
      super();
    }
  }

  @CommandHandler(UpdateCalendarEvent, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<UpdateCalendarEvent> {
    constructor(
      private readonly events: CalendarEventRepository,
      private readonly attendees: CalendarAttendees,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: CalendarEventRequest,
    ) {}

    async execute({
      calendarEventId,
      changes,
    }: UpdateCalendarEvent): Promise<void> {
      const event = await this.events.findById(calendarEventId);
      if (!event) {
        throw new CalendarEventNotFoundException(calendarEventId);
      }
      this.publisher.mergeObjectContext(event, this.request);
      const now = new Date();
      const team = await this.teamOf(changes);
      event.revise(
        {
          details:
            changes.details && event.details.revisedWith(changes.details),
          responsible: changes.responsibleId
            ? await this.attendees.user(changes.responsibleId)
            : undefined,
          participants: await this.participantsOf(event, changes, team),
          team,
        },
        now,
      );
      if (changes.window) {
        event.reschedule(event.window.rescheduledTo(changes.window), now);
      }
      await this.events.save(event);
      event.commit();
    }

    private async teamOf(changes: Changes): Promise<Team | null | undefined> {
      if (changes.teamId === undefined) {
        return undefined;
      }
      return changes.teamId
        ? this.attendees.team(changes.teamId, this.request.tenantId)
        : null;
    }

    private async participantsOf(
      event: CalendarEvent,
      changes: Changes,
      team: Team | null | undefined,
    ): Promise<User[] | undefined> {
      if (!changes.participantIds && !team) {
        return undefined;
      }
      const chosen = changes.participantIds
        ? await this.attendees.usersOf(changes.participantIds)
        : event.participants.getItems();
      return [...chosen, ...(team ? await this.attendees.membersOf(team) : [])];
    }
  }
}
