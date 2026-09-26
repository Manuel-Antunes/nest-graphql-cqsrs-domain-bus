import { QueryBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import type { User } from '@nestposts/users/domain/user/user.entity';

import type { CalendarTesting } from '../../../../test/support/calendar-fixtures';
import {
  calendarTesting,
  givenAnEvent,
  givenATeam,
} from '../../../../test/support/calendar-fixtures';
import {
  createCqrsTestingModule,
  inRequestContext,
} from '../../../../test/support/cqrs-testing-module';
import { givenAUser } from '../../../../test/support/post-fixtures';
import { FindCalendarEventsQuery } from './find-calendar-events.query';

describe('FindCalendarEventsQuery.Handler', () => {
  let module: TestingModule;
  let queries: QueryBus;
  let calendar: CalendarTesting;
  let ana: User;
  let rui: User;
  let lia: User;

  const day = (date: number, hour = 9) =>
    new Date(Date.UTC(2026, 9, date, hour));

  const titlesSeenBy = async (
    viewer: User,
    range: FindCalendarEventsQuery.Range = {},
    seesEverything = false,
  ) =>
    (
      await inRequestContext(module, () =>
        queries.execute(
          new FindCalendarEventsQuery.FindCalendarEvents(
            { userId: viewer.id, seesEverything },
            range,
          ),
        ),
      )
    ).items.map((event) => event.responsible.getEntity().name.value);

  beforeEach(async () => {
    calendar = calendarTesting();
    module = await createCqrsTestingModule(
      [FindCalendarEventsQuery.Handler, ...calendar.providers],
      calendar.imports,
    );
    queries = module.get(QueryBus);
    ana = await givenAUser(module, 'ana@example.com', 'ana');
    rui = await givenAUser(module, 'rui@example.com', 'rui');
    lia = await givenAUser(module, 'lia@example.com', 'lia');
    await givenAnEvent(module, ana, [], null, {
      startDate: day(1),
      endDate: day(1, 10),
    });
    await givenAnEvent(module, rui, [ana], null, {
      startDate: day(2),
      endDate: day(2, 10),
    });
    await givenAnEvent(module, lia, [], null, {
      startDate: day(3),
      endDate: day(3, 10),
    });
  });

  afterEach(() => module.close());

  it('shows whoever sees everything every event', async () => {
    expect(await titlesSeenBy(lia, {}, true)).toEqual(['ana', 'rui', 'lia']);
  });

  it('shows anybody else the events they are the responsible for or a participant of', async () => {
    expect(await titlesSeenBy(ana)).toEqual(['ana', 'rui']);
    expect(await titlesSeenBy(lia)).toEqual(['lia']);
  });

  it('narrows to the range and to the team it is asked for', async () => {
    const team = await givenATeam(module);
    await givenAnEvent(module, rui, [], team, {
      startDate: day(2, 14),
      endDate: day(2, 15),
    });

    expect(
      await titlesSeenBy(lia, { from: day(2, 0), to: day(2, 23) }, true),
    ).toEqual(['rui', 'rui']);
    expect(await titlesSeenBy(lia, { teamId: team.id }, true)).toEqual(['rui']);
  });

  it('never pages more than the most it allows', () => {
    const viewer = { userId: ana.id, seesEverything: false };

    expect(
      new FindCalendarEventsQuery.FindCalendarEvents(viewer, {}, 10_000).first,
    ).toBe(FindCalendarEventsQuery.MAX_PAGE_SIZE);
    expect(new FindCalendarEventsQuery.FindCalendarEvents(viewer).first).toBe(
      FindCalendarEventsQuery.DEFAULT_PAGE_SIZE,
    );
  });
});
