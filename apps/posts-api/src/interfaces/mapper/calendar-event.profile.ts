import type { Mapper, MappingProfile } from '@automapper/core';
import {
  createMap,
  forMember,
  mapFrom,
  mapWithArguments,
} from '@automapper/core';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { CalendarEvent } from '@nestposts/events/domain/calendar-event/calendar-event.entity';
import { CalendarEventDetails } from '@nestposts/events/domain/calendar-event/vo/calendar-event-details';
import { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import { CalendarEventWindow } from '@nestposts/events/domain/calendar-event/vo/calendar-event-window';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { CreateCalendarEventCommand } from '../../application/calendar-event/command/create-calendar-event.command';
import { UpdateCalendarEventCommand } from '../../application/calendar-event/command/update-calendar-event.command';
import {
  CreateEventInput,
  CreateMyEventInput,
  UpdateEventInput,
} from '../../dto/graphql/calendar-event.input';
import { CalendarEventView } from '../../dto/graphql/calendar-event.view';
import { TeamProfile } from './team.profile';
import { UserProfile } from './user.profile';

@Injectable()
export class CalendarEventProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile(): MappingProfile {
    return (mapper) => {
      createMap(
        mapper,
        CalendarEvent,
        CalendarEventView,
        forMember(
          (view) => view.id,
          mapFrom((event) => event.id),
        ),
        forMember(
          (view) => view.title,
          mapFrom((event) => event.details.title),
        ),
        forMember(
          (view) => view.description,
          mapFrom((event) => event.details.description),
        ),
        forMember(
          (view) => view.startDate,
          mapFrom((event) => event.window.startDate),
        ),
        forMember(
          (view) => view.endDate,
          mapFrom((event) => event.window.endDate),
        ),
        forMember(
          (view) => view.color,
          mapFrom((event) => event.details.color),
        ),
        forMember(
          (view) => view.createdAt,
          mapFrom((event) => event.createdAt),
        ),
        forMember(
          (view) => view.updatedAt,
          mapFrom((event) => event.updatedAt),
        ),
        forMember(
          (view) => view.responsible,
          mapFrom((event) =>
            UserProfile.viewOf(mapper, event.responsible.getEntity()),
          ),
        ),
        forMember(
          (view) => view.participants,
          mapFrom((event) =>
            event.participants
              .getItems()
              .map((user) => UserProfile.viewOf(mapper, user)),
          ),
        ),
        forMember(
          (view) => view.team,
          mapFrom((event) =>
            event.team
              ? TeamProfile.viewOf(mapper, event.team.getEntity())
              : null,
          ),
        ),
      );

      createMap(
        mapper,
        CreateMyEventInput,
        CreateCalendarEventCommand.CreateCalendarEvent,
        forMember(
          (command) => command.calendarEventId,
          mapFrom(() => CalendarEventId.generate()),
        ),
        forMember(
          (command) => command.event,
          mapWithArguments((input, args) =>
            CalendarEventProfile.newEventOf(
              input,
              CalendarEventProfile.responsibleOf(args).id,
            ),
          ),
        ),
      );

      createMap(
        mapper,
        CreateEventInput,
        CreateCalendarEventCommand.CreateCalendarEvent,
        forMember(
          (command) => command.calendarEventId,
          mapFrom(() => CalendarEventId.generate()),
        ),
        forMember(
          (command) => command.event,
          mapFrom((input) =>
            CalendarEventProfile.newEventOf(
              input,
              input.responsibleId.assertValid(),
            ),
          ),
        ),
      );

      createMap(
        mapper,
        UpdateEventInput,
        UpdateCalendarEventCommand.UpdateCalendarEvent,
        forMember(
          (command) => command.calendarEventId,
          mapFrom((input) => input.id.assertValid()),
        ),
        forMember(
          (command) => command.changes,
          mapFrom((input) => CalendarEventProfile.changesOf(input)),
        ),
      );
    };
  }

  private static responsibleOf(args: Record<string, unknown>): User {
    return args.responsible as User;
  }

  private static newEventOf(
    input: CreateMyEventInput,
    responsibleId: UserId,
  ): CreateCalendarEventCommand.NewEvent {
    return {
      details: CalendarEventDetails.parse({
        title: input.title,
        description: input.description,
        color: input.color,
      }),
      window: CalendarEventWindow.between(input.startDate, input.endDate),
      responsibleId,
      participantIds: CalendarEventProfile.userIdsOf(input.participantIds),
      teamId: input.teamId?.assertValid() ?? null,
    };
  }

  private static changesOf(
    input: UpdateEventInput,
  ): UpdateCalendarEventCommand.Changes {
    return {
      details: {
        title: input.title ?? undefined,
        description: input.description,
        color: input.color ?? undefined,
      },
      window:
        input.startDate || input.endDate
          ? {
              startDate: input.startDate ?? undefined,
              endDate: input.endDate ?? undefined,
            }
          : undefined,
      responsibleId: input.responsibleId?.assertValid(),
      participantIds: input.participantIds
        ? CalendarEventProfile.userIdsOf(input.participantIds)
        : undefined,
      teamId: input.teamId === null ? null : input.teamId?.assertValid(),
    };
  }

  private static userIdsOf(
    ids: readonly string[] | null | undefined,
  ): UserId[] {
    return (ids ?? []).map((id) => UserId.parse(id));
  }
}
