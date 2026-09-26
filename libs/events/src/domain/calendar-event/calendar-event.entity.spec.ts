import type { MikroORM } from '@mikro-orm/core';
import { ref } from '@mikro-orm/core';
import { metadataOnly } from '@nestposts/database/testing';
import { Organization } from '@nestposts/organizations/domain/organization/organization.entity';
import { Team } from '@nestposts/organizations/domain/organization/team.entity';
import { OrganizationId } from '@nestposts/organizations/domain/organization/vo/organization-id';
import { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';
import { TeamName } from '@nestposts/organizations/domain/organization/vo/team-name';
import { OrganizationEntitySchema } from '@nestposts/organizations/infrastructure/persistence/entities/organization-orm.entity';
import { TeamEntitySchema } from '@nestposts/organizations/infrastructure/persistence/entities/team-orm.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

import { CalendarEventEntitySchema } from '../../infrastructure/persistence/entities/calendar-event-orm.entity';
import { CalendarEvent } from './calendar-event.entity';
import { CalendarEventCreatedEvent } from './event/calendar-event-created.event';
import { CalendarEventDeletedEvent } from './event/calendar-event-deleted.event';
import { CalendarEventRescheduledEvent } from './event/calendar-event-rescheduled.event';
import { CalendarEventUpdatedEvent } from './event/calendar-event-updated.event';
import { CalendarEventColor } from './vo/calendar-event-color';
import { CalendarEventDetails } from './vo/calendar-event-details';
import { CalendarEventId } from './vo/calendar-event-id';
import { CalendarEventTitle } from './vo/calendar-event-title';
import { CalendarEventWindow } from './vo/calendar-event-window';

describe('CalendarEvent', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await metadataOnly([
      CalendarEventEntitySchema,
      UserEntitySchema,
      AuthorshipEntitySchema,
      OrganizationEntitySchema,
      TeamEntitySchema,
    ]);
  });

  afterAll(() => orm.close());

  const id = CalendarEventId.parse('6b1f3d2a-8c4e-4f5a-9b7d-1e2c3a4b5c6d');
  const now = new Date('2026-09-24T12:00:00.000Z');
  const later = new Date('2026-09-24T12:05:00.000Z');
  const window = CalendarEventWindow.between(
    new Date('2026-10-01T09:00:00.000Z'),
    new Date('2026-10-01T10:00:00.000Z'),
  );

  const details = (
    input: Parameters<typeof CalendarEventDetails.parse>[0],
  ): CalendarEventDetails => CalendarEventDetails.parse(input);

  const planning = details({
    title: 'Planning',
    description: 'Sprint planning',
    color: 'green',
  });

  const aUser = (userId: string, name: string): User => {
    const user = User.register(
      UserId.parse(userId),
      { email: `${name}@example.com`, name },
      [],
      now,
    );
    user.uncommit();
    return user;
  };

  const ana = aUser('0f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a', 'ana');
  const rui = aUser('1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', 'rui');
  const lia = aUser('2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', 'lia');

  const aTeam = (teamId = 'team_design'): Team =>
    Object.assign(new Team(), {
      id: TeamId.parse(teamId),
      name: TeamName.parse('Design'),
      organization: ref(Organization, OrganizationId.parse('org_acme')),
      memberCount: 2,
      createdAt: now,
    });

  const anEvent = (
    overrides: Partial<Parameters<typeof CalendarEvent.schedule>[3]> = {},
  ): CalendarEvent => {
    const event = CalendarEvent.schedule(
      id,
      planning,
      window,
      { responsible: ana, participants: [rui], team: null, ...overrides },
      now,
    );
    event.uncommit();
    return event;
  };

  describe('schedule', () => {
    it('raises CalendarEventCreated carrying the whole event, and answers with it applied', () => {
      const team = aTeam();
      const scheduled = details({
        title: '  Planning  ',
        description: 'Sprint planning',
      });

      const event = CalendarEvent.schedule(
        id,
        scheduled,
        window,
        { responsible: ana, participants: [rui, lia], team },
        now,
      );

      expect(event.getUncommittedEvents()).toEqual([
        new CalendarEventCreatedEvent(
          id.value,
          'Planning',
          'Sprint planning',
          window.startDate,
          window.endDate,
          'blue',
          ana.id.value,
          [rui.id.value, lia.id.value],
          team.id.value,
          now,
        ),
      ]);
      expect(event).toMatchObject({ id, createdAt: now, updatedAt: now });
      expect(event.details.equals(scheduled)).toBe(true);
      expect(event.details.color).toEqual(CalendarEventColor.parse('blue'));
      expect(event.window.equals(window)).toBe(true);
      expect(event.responsible.id.equals(ana.id)).toBe(true);
      expect(event.team?.id.equals(team.id)).toBe(true);
    });

    it('keeps the users it was given as the participants, not references to them', () => {
      const event = anEvent({ participants: [rui, lia] });

      expect(event.participants.getItems()).toEqual([rui, lia]);
    });

    it('never counts the responsible, or anybody twice, among the participants', () => {
      const event = CalendarEvent.schedule(
        id,
        planning,
        window,
        { responsible: ana, participants: [rui, ana, rui, lia], team: null },
        now,
      );

      expect(
        (event.getUncommittedEvents()[0] as CalendarEventCreatedEvent)
          .participantIds,
      ).toEqual([rui.id.value, lia.id.value]);
    });
  });

  describe('revise', () => {
    it('raises CalendarEventUpdated with the resulting details and attendees', () => {
      const event = anEvent();

      event.revise(
        {
          details: details({ title: 'Retro', description: null, color: 'RED' }),
          responsible: rui,
          participants: [lia],
        },
        later,
      );

      expect(event.getUncommittedEvents()).toEqual([
        new CalendarEventUpdatedEvent(
          id.value,
          'Retro',
          null,
          'red',
          rui.id.value,
          [lia.id.value],
          null,
          later,
        ),
      ]);
      expect(event.details.description).toBeNull();
      expect(event.responsible.id.equals(rui.id)).toBe(true);
      expect(event.participants.getItems()).toEqual([lia]);
      expect(event.createdAt).toEqual(now);
      expect(event.updatedAt).toEqual(later);
    });

    it('drops the new responsible from the participants they were already in', () => {
      const event = anEvent({ participants: [rui, lia] });

      event.revise({ responsible: rui }, later);

      expect(
        (event.getUncommittedEvents()[0] as CalendarEventUpdatedEvent)
          .participantIds,
      ).toEqual([lia.id.value]);
      expect(event.participants.getIdentifiers()).toEqual([lia.id]);
    });

    it('assigns a team and clears it with null', () => {
      const event = anEvent();
      const team = aTeam();

      event.revise({ team }, later);
      expect(event.team?.id.equals(team.id)).toBe(true);

      event.revise({ team: null }, later);
      expect(event.team).toBeNull();
      expect(
        event
          .getUncommittedEvents()
          .map((raised) => (raised as CalendarEventUpdatedEvent).teamId),
      ).toEqual([team.id.value, null]);
    });

    it('raises nothing when nothing would change', () => {
      const event = anEvent();

      event.revise(
        {
          details: details({
            title: 'Planning',
            description: 'Sprint planning',
            color: 'green',
          }),
          responsible: ana,
          participants: [rui],
          team: null,
        },
        later,
      );

      expect(event.getUncommittedEvents()).toEqual([]);
      expect(event.updatedAt).toEqual(now);
    });
  });

  describe('reschedule', () => {
    it('raises CalendarEventRescheduled with where the event was before', () => {
      const event = anEvent();
      const moved = CalendarEventWindow.between(
        new Date('2026-10-02T09:00:00.000Z'),
        new Date('2026-10-02T11:00:00.000Z'),
      );

      event.reschedule(moved, later);

      expect(event.getUncommittedEvents()).toEqual([
        new CalendarEventRescheduledEvent(
          id.value,
          moved.startDate,
          moved.endDate,
          window.startDate,
          window.endDate,
          1,
          later,
        ),
      ]);
      expect(event.window.equals(moved)).toBe(true);
      expect(event.updatedAt).toEqual(later);
    });

    it('is a new revision of the event each time it moves, which the calendar invite counts', () => {
      const event = anEvent();

      event.reschedule(
        CalendarEventWindow.between(
          new Date('2026-10-02T09:00:00.000Z'),
          new Date('2026-10-02T10:00:00.000Z'),
        ),
        later,
      );
      event.reschedule(
        CalendarEventWindow.between(
          new Date('2026-10-03T09:00:00.000Z'),
          new Date('2026-10-03T10:00:00.000Z'),
        ),
        later,
      );

      expect(event.sequence).toBe(2);
      expect(
        event
          .getUncommittedEvents()
          .map((raised) => (raised as CalendarEventRescheduledEvent).sequence),
      ).toEqual([1, 2]);
    });

    it('raises nothing when the dates stay where they are', () => {
      const event = anEvent();

      event.reschedule(
        CalendarEventWindow.between(
          new Date(window.startDate),
          new Date(window.endDate),
        ),
        later,
      );

      expect(event.getUncommittedEvents()).toEqual([]);
    });
  });

  it('delete raises CalendarEventDeleted', () => {
    const event = anEvent();

    event.delete(later);

    expect(event.getUncommittedEvents()).toEqual([
      new CalendarEventDeletedEvent(id.value, later),
    ]);
  });

  it('replays its own history into the same state', () => {
    const event = anEvent({ participants: [rui], team: aTeam() });
    const history = [
      new CalendarEventCreatedEvent(
        id.value,
        'Planning',
        'Sprint planning',
        window.startDate,
        window.endDate,
        'green',
        ana.id.value,
        [rui.id.value],
        'team_design',
        now,
      ),
      new CalendarEventUpdatedEvent(
        id.value,
        'Retro',
        null,
        'red',
        ana.id.value,
        [lia.id.value],
        null,
        later,
      ),
    ];
    event.revise(
      {
        details: event.details.revisedWith({
          title: CalendarEventTitle.parse('Retro'),
          description: null,
          color: CalendarEventColor.parse('red'),
        }),
      },
      later,
    );
    event.revise({ participants: [lia], team: null }, later);

    const replayed = new CalendarEvent();
    replayed.loadFromHistory(history);

    expect(replayed).toMatchObject({
      id: event.id,
      team: null,
      createdAt: now,
      updatedAt: later,
    });
    expect(replayed.details.equals(event.details)).toBe(true);
    expect(replayed.window.equals(event.window)).toBe(true);
    expect(replayed.responsible.id.equals(ana.id)).toBe(true);
    expect(replayed.participants.getIdentifiers()).toEqual([lia.id]);
  });
});
