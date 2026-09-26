import { AutoMap } from '@automapper/classes';
import type { Ref } from '@mikro-orm/core';
import { Collection, ref, rel } from '@mikro-orm/core';
import { Team } from '@nestposts/organizations/domain/organization/team.entity';
import { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';
import { AggregateRoot } from '@nestposts/platform/domain/shared/aggregate-root';
import { BaseEntity } from '@nestposts/platform/domain/shared/base-entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { CalendarEventCreatedEvent } from './event/calendar-event-created.event';
import { CalendarEventDeletedEvent } from './event/calendar-event-deleted.event';
import { CalendarEventRescheduledEvent } from './event/calendar-event-rescheduled.event';
import { CalendarEventUpdatedEvent } from './event/calendar-event-updated.event';
import type { ICalendarEvent } from './schemas/calendar-event.schema';
import { CalendarEventDetails } from './vo/calendar-event-details';
import { CalendarEventId } from './vo/calendar-event-id';
import { CalendarEventWindow } from './vo/calendar-event-window';

export type CalendarEventDomainEvent =
  | CalendarEventCreatedEvent
  | CalendarEventUpdatedEvent
  | CalendarEventRescheduledEvent
  | CalendarEventDeletedEvent;

export interface CalendarEventAttendance {
  readonly responsible: User;
  readonly participants: readonly User[];
  readonly team: Team | null;
}

export interface CalendarEventRevision {
  readonly details?: CalendarEventDetails;
  readonly responsible?: User;
  readonly participants?: readonly User[];
  readonly team?: Team | null;
}

interface CalendarEventAttendees {
  readonly responsibleId: string;
  readonly participantIds: readonly string[];
  readonly teamId: string | null;
}

type Attendee = Pick<User, 'id'>;

export class CalendarEvent
  extends AggregateRoot(BaseEntity)<CalendarEventDomainEvent>
  implements ICalendarEvent
{
  @AutoMap(() => CalendarEventId)
  id!: CalendarEventId;

  details!: CalendarEventDetails;

  window!: CalendarEventWindow;

  responsible!: Ref<User>;

  readonly participants = new Collection<User, CalendarEvent>(this);

  team: Ref<Team> | null = null;

  sequence = 0;

  static schedule(
    id: CalendarEventId,
    details: CalendarEventDetails,
    window: CalendarEventWindow,
    attendance: CalendarEventAttendance,
    now: Date,
  ): CalendarEvent {
    const participants = CalendarEvent.besides(
      attendance.responsible,
      attendance.participants,
    );
    const event = new CalendarEvent();
    event.responsible = ref(attendance.responsible);
    event.participants.set(participants);
    event.team = attendance.team && ref(attendance.team);
    event.apply(
      new CalendarEventCreatedEvent(
        id.value,
        details.title.value,
        details.description?.value ?? null,
        window.startDate,
        window.endDate,
        details.color.value,
        attendance.responsible.id.value,
        participants.map((participant) => participant.id.value),
        attendance.team?.id.value ?? null,
        now,
      ),
    );
    return event;
  }

  revise(revision: CalendarEventRevision, now: Date): this {
    const details = revision.details ?? this.details;
    const responsible = revision.responsible ?? this.responsible;
    const participants = CalendarEvent.besides(
      responsible,
      revision.participants ?? this.participants.getItems(),
    );
    const team = revision.team === undefined ? this.team : revision.team;

    const unchanged =
      details.equals(this.details) &&
      responsible.id.equals(this.responsible.id) &&
      CalendarEvent.sameAttendees(participants, this.participants.getItems()) &&
      (team?.id.value ?? null) === (this.team?.id.value ?? null);
    if (unchanged) {
      return this;
    }

    if (revision.responsible) {
      this.responsible = ref(revision.responsible);
    }
    if (revision.participants) {
      this.participants.set(participants);
    }
    if (revision.team !== undefined) {
      this.team = revision.team && ref(revision.team);
    }
    this.apply(
      new CalendarEventUpdatedEvent(
        this.id.value,
        details.title.value,
        details.description?.value ?? null,
        details.color.value,
        responsible.id.value,
        participants.map((participant) => participant.id.value),
        team?.id.value ?? null,
        now,
      ),
    );
    return this;
  }

  reschedule(window: CalendarEventWindow, now: Date): this {
    if (window.equals(this.window)) {
      return this;
    }
    this.apply(
      new CalendarEventRescheduledEvent(
        this.id.value,
        window.startDate,
        window.endDate,
        this.window.startDate,
        this.window.endDate,
        this.sequence + 1,
        now,
      ),
    );
    return this;
  }

  delete(now: Date): this {
    this.apply(new CalendarEventDeletedEvent(this.id.value, now));
    return this;
  }

  onCalendarEventCreatedEvent(event: CalendarEventCreatedEvent): void {
    this.id = CalendarEventId.parse(event.calendarEventId);
    this.window = CalendarEventWindow.between(event.startDate, event.endDate);
    this.details = CalendarEventDetails.parse(event);
    this.applyAttendees(event);
    this.stampCreation(event.occurredAt);
  }

  onCalendarEventUpdatedEvent(event: CalendarEventUpdatedEvent): void {
    this.details = CalendarEventDetails.parse(event);
    this.applyAttendees(event);
    this.touch(event.occurredAt);
  }

  onCalendarEventRescheduledEvent(event: CalendarEventRescheduledEvent): void {
    this.window = CalendarEventWindow.between(event.startDate, event.endDate);
    this.sequence = event.sequence;
    this.touch(event.occurredAt);
  }

  onCalendarEventDeletedEvent(event: CalendarEventDeletedEvent): void {
    this.touch(event.occurredAt);
  }

  private applyAttendees(attendees: CalendarEventAttendees): void {
    this.responsible = this.sameResponsibleOr(attendees.responsibleId);
    this.team = this.sameTeamOr(attendees.teamId);
    const atHand = new Map(
      this.participants
        .getItems(false)
        .map((participant) => [participant.id.value as string, participant]),
    );
    this.participants.set(
      attendees.participantIds.map(
        (userId) => atHand.get(userId) ?? rel(User, UserId.parse(userId)),
      ),
    );
  }

  private sameResponsibleOr(userId: string): Ref<User> {
    return this.responsible?.id.equals(userId)
      ? this.responsible
      : ref(User, UserId.parse(userId));
  }

  private sameTeamOr(teamId: string | null): Ref<Team> | null {
    if (teamId === null) {
      return null;
    }
    return this.team?.id.equals(teamId)
      ? this.team
      : ref(Team, TeamId.parse(teamId));
  }

  private static besides<T extends Attendee>(
    responsible: Attendee,
    participants: readonly T[],
  ): T[] {
    const seen = new Set<string>([responsible.id.value]);
    return participants.filter((participant) => {
      const id = participant.id.value as string;
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
  }

  private static sameAttendees(
    one: readonly Attendee[],
    other: readonly Attendee[],
  ): boolean {
    const ids = new Set(one.map((attendee) => attendee.id.value as string));
    return (
      ids.size === other.length &&
      other.every((attendee) => ids.has(attendee.id.value))
    );
  }
}
