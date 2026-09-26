import { inRequestContext } from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import {
  closeTestDatabase,
  tableIn,
  testDatabase,
} from '@nestposts/database/testing';
import { Organization } from '@nestposts/organizations/domain/organization/organization.entity';
import { Team } from '@nestposts/organizations/domain/organization/team.entity';
import { OrganizationId } from '@nestposts/organizations/domain/organization/vo/organization-id';
import { OrganizationName } from '@nestposts/organizations/domain/organization/vo/organization-name';
import { OrganizationSlug } from '@nestposts/organizations/domain/organization/vo/organization-slug';
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

import type { CalendarEventAttendance } from '../../../domain/calendar-event/calendar-event.entity';
import { CalendarEvent } from '../../../domain/calendar-event/calendar-event.entity';
import type { CalendarRange } from '../../../domain/calendar-event/calendar-event.repository';
import { CalendarEventColor } from '../../../domain/calendar-event/vo/calendar-event-color';
import { CalendarEventDescription } from '../../../domain/calendar-event/vo/calendar-event-description';
import { CalendarEventDetails } from '../../../domain/calendar-event/vo/calendar-event-details';
import { CalendarEventId } from '../../../domain/calendar-event/vo/calendar-event-id';
import { CalendarEventTitle } from '../../../domain/calendar-event/vo/calendar-event-title';
import { CalendarEventWindow } from '../../../domain/calendar-event/vo/calendar-event-window';
import { CalendarEventEntitySchema } from '../entities/calendar-event-orm.entity';
import { MikroOrmCalendarEventRepository } from './mikro-orm-calendar-event.repository';

describe('MikroOrmCalendarEventRepository', () => {
  let orm: AnyMikroORM;

  const now = new Date('2026-09-24T12:00:00.000Z');
  const day = (date: number, hour: number) =>
    new Date(Date.UTC(2026, 9, date, hour));

  beforeAll(async () => {
    orm = await testDatabase(
      {
        entities: [
          CalendarEventEntitySchema,
          UserEntitySchema,
          AuthorshipEntitySchema,
          OrganizationEntitySchema,
          TeamEntitySchema,
        ],
      },
      'calendar',
    );
  });

  afterAll(() => closeTestDatabase(orm));

  const inContext = <T>(
    work: (repository: MikroOrmCalendarEventRepository) => Promise<T>,
  ): Promise<T> =>
    inRequestContext(orm.em, () =>
      work(new MikroOrmCalendarEventRepository(orm.em)),
    );

  const givenAUser = async (name: string): Promise<User> => {
    const user = User.register(
      UserId.generate(),
      { email: `${name}+${UserId.generate()}@example.com`, name },
      [],
      now,
    );
    user.uncommit();
    await orm.em.fork().persist(user).flush();
    return user;
  };

  const givenATeam = async (): Promise<Team> => {
    const suffix = UserId.generate().value.slice(0, 8);
    const organization = Object.assign(new Organization(), {
      id: OrganizationId.parse(`org_${suffix}`),
      name: OrganizationName.parse('Acme'),
      slug: OrganizationSlug.parse(`acme-${suffix}`),
      createdAt: now,
    });
    const team = Object.assign(new Team(), {
      id: TeamId.parse(`team_${suffix}`),
      name: TeamName.parse('Design'),
      organization,
      memberCount: 0,
      createdAt: now,
    });
    await orm.em.fork().persist([organization, team]).flush();
    return team;
  };

  const givenAnEvent = async (
    attendance: Partial<CalendarEventAttendance> & { responsible: User },
    startDate = day(1, 9),
    endDate = day(1, 10),
  ): Promise<CalendarEvent> =>
    inContext(async (repository) => {
      const em = orm.em.getContext();
      const event = CalendarEvent.schedule(
        CalendarEventId.generate(),
        CalendarEventDetails.parse({
          title: 'Planning',
          description: 'Sprint planning',
        }),
        CalendarEventWindow.between(startDate, endDate),
        {
          participants: [],
          team: null,
          ...attendance,
          responsible: await em.findOneOrFail(User, {
            id: attendance.responsible.id,
          }),
        },
        now,
      );
      event.uncommit();
      await repository.save(event);
      return event;
    });

  const idsIn = (range: CalendarRange, first = 50) =>
    inContext(async (repository) =>
      (await repository.findOverlapping(range, { first })).items.map(
        (event) => event.id.value,
      ),
    );

  it('saves the event and finds it again, relations loaded and value objects intact', async () => {
    const ana = await givenAUser('ana');
    const rui = await givenAUser('rui');
    const team = await givenATeam();
    const saved = await givenAnEvent({
      responsible: ana,
      participants: [rui],
      team,
    });

    const found = await inContext(async (repository) => {
      const event = await repository.findById(saved.id);
      return {
        event,
        responsible: event?.responsible.getEntity(),
        participants: event?.participants.getItems(),
        team: event?.team?.getEntity(),
      };
    });

    expect(found.event?.id).toEqual(saved.id);
    expect(found.event?.details).toBeInstanceOf(CalendarEventDetails);
    expect(found.event?.details).toMatchObject({
      title: CalendarEventTitle.parse('Planning'),
      description: CalendarEventDescription.parse('Sprint planning'),
      color: CalendarEventColor.standard(),
    });
    expect(found.event?.window).toBeInstanceOf(CalendarEventWindow);
    expect(
      found.event?.window.equals(
        CalendarEventWindow.between(day(1, 9), day(1, 10)),
      ),
    ).toBe(true);
    expect(found.responsible?.name.value).toBe('ana');
    expect(found.participants?.map((user) => user.name.value)).toEqual(['rui']);
    expect(found.team?.name.value).toBe('Design');
  });

  it('finds what overlaps the range, in the order the events start', async () => {
    const ana = await givenAUser('ana');
    const endsBefore = await givenAnEvent(
      { responsible: ana },
      day(3, 8),
      day(3, 9),
    );
    const startsInside = await givenAnEvent(
      { responsible: ana },
      day(3, 11),
      day(3, 13),
    );
    const spansIt = await givenAnEvent(
      { responsible: ana },
      day(3, 7),
      day(3, 18),
    );
    const startsAfter = await givenAnEvent(
      { responsible: ana },
      day(3, 16),
      day(3, 17),
    );

    const found = await idsIn({
      from: day(3, 10),
      to: day(3, 15),
      attendee: ana.id,
    });

    expect(found).toEqual([spansIt.id.value, startsInside.id.value]);
    expect(found).not.toContain(endsBefore.id.value);
    expect(found).not.toContain(startsAfter.id.value);
  });

  it('narrows to what someone attends — responsible or participant — and counts each event once', async () => {
    const ana = await givenAUser('ana');
    const rui = await givenAUser('rui');
    const lia = await givenAUser('lia');
    const outsider = await givenAUser('outsider');
    const anasCrowded = await givenAnEvent(
      { responsible: ana, participants: [rui, lia] },
      day(5, 9),
      day(5, 10),
    );
    const ruisWithAna = await givenAnEvent(
      { responsible: rui, participants: [ana, lia] },
      day(5, 11),
      day(5, 12),
    );
    await givenAnEvent({ responsible: outsider }, day(5, 13), day(5, 14));

    const page = await inContext((repository) =>
      repository.findOverlapping(
        { from: day(5, 0), to: day(5, 23), attendee: ana.id },
        { first: 50 },
      ),
    );

    expect(page.items.map((event) => event.id.value)).toEqual([
      anasCrowded.id.value,
      ruisWithAna.id.value,
    ]);
    expect(page.totalCount).toBe(2);
  });

  it('with nobody to narrow to, answers every event in the range', async () => {
    const ana = await givenAUser('ana');
    const rui = await givenAUser('rui');
    const first = await givenAnEvent(
      { responsible: ana },
      day(7, 9),
      day(7, 10),
    );
    const second = await givenAnEvent(
      { responsible: rui },
      day(7, 11),
      day(7, 12),
    );

    expect(await idsIn({ from: day(7, 0), to: day(7, 23) })).toEqual([
      first.id.value,
      second.id.value,
    ]);
  });

  it('narrows to one team', async () => {
    const ana = await givenAUser('ana');
    const team = await givenATeam();
    const teams = await givenAnEvent(
      { responsible: ana, team },
      day(9, 9),
      day(9, 10),
    );
    await givenAnEvent({ responsible: ana }, day(9, 11), day(9, 12));

    expect(
      await idsIn({ from: day(9, 0), to: day(9, 23), teamId: team.id }),
    ).toEqual([teams.id.value]);
  });

  it('pages forward with the cursor it answered', async () => {
    const ana = await givenAUser('ana');
    const events = [];
    for (const hour of [9, 10, 11]) {
      events.push(
        await givenAnEvent({ responsible: ana }, day(11, hour), day(11, hour)),
      );
    }
    const range = { from: day(11, 0), to: day(11, 23), attendee: ana.id };

    const firstPage = await inContext((repository) =>
      repository.findOverlapping(range, { first: 2 }),
    );
    const secondPage = await inContext((repository) =>
      repository.findOverlapping(range, {
        first: 2,
        after: firstPage.endCursor,
      }),
    );

    expect(firstPage.items.map((event) => event.id.value)).toEqual([
      events[0].id.value,
      events[1].id.value,
    ]);
    expect(firstPage.hasNextPage).toBe(true);
    expect(secondPage.items.map((event) => event.id.value)).toEqual([
      events[2].id.value,
    ]);
  });

  it('removes the event and the links to its participants', async () => {
    const ana = await givenAUser('ana');
    const rui = await givenAUser('rui');
    const saved = await givenAnEvent({ responsible: ana, participants: [rui] });

    await inContext(async (repository) => {
      const event = await repository.findById(saved.id);
      if (event) {
        await repository.remove(event);
      }
    });

    expect(
      await inContext((repository) => repository.findById(saved.id)),
    ).toBeNull();
    expect(
      await orm.em
        .getConnection()
        .execute(
          `select * from ${tableIn(orm, 'calendar_events_participants')} where calendar_event_id = ?`,
          [saved.id.value],
        ),
    ).toEqual([]);
  });

  it('lets a team go without the events that were assigned to it', async () => {
    const ana = await givenAUser('ana');
    const team = await givenATeam();
    const saved = await givenAnEvent({ responsible: ana, team });

    await orm.em.fork().nativeDelete(Team, { id: team.id });

    const found = await inContext((repository) =>
      repository.findById(saved.id),
    );
    expect(found?.team).toBeNull();
  });
});
