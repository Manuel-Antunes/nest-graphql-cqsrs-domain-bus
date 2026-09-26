import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { CalendarEvent } from '@nestposts/events/domain/calendar-event/calendar-event.entity';
import { CalendarEventRescheduledEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-rescheduled.event';
import { CalendarEventUpdatedEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-updated.event';
import { CalendarEventNotFoundException } from '@nestposts/events/domain/calendar-event/exception/calendar-event-not-found.exception';
import { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import { CalendarEventTitle } from '@nestposts/events/domain/calendar-event/vo/calendar-event-title';
import type { User } from '@nestposts/users/domain/user/user.entity';

import type { CalendarTesting } from '../../../../test/support/calendar-fixtures';
import {
  calendarTesting,
  givenAnEvent,
  givenATeam,
  TENANT,
} from '../../../../test/support/calendar-fixtures';
import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
  RecordingEvents,
} from '../../../../test/support/cqrs-testing-module';
import { givenAUser } from '../../../../test/support/post-fixtures';
import { CalendarEventRequest } from '../calendar-event-request';
import { UpdateCalendarEventCommand } from './update-calendar-event.command';

describe('UpdateCalendarEventCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;
  let calendar: CalendarTesting;
  let ana: User;
  let rui: User;
  let lia: User;

  const execute = (
    id: CalendarEventId,
    changes: UpdateCalendarEventCommand.Changes,
  ) =>
    inRequestContext(module, () =>
      commands.execute(
        new UpdateCalendarEventCommand.UpdateCalendarEvent(id, changes),
        new CalendarEventRequest(id, TENANT),
      ),
    );

  const saved = (id: CalendarEventId) =>
    freshEm(module).findOneOrFail(
      CalendarEvent,
      { id },
      { populate: ['responsible', 'participants', 'team'] },
    );

  beforeEach(async () => {
    calendar = calendarTesting();
    module = await createCqrsTestingModule(
      [UpdateCalendarEventCommand.Handler, ...calendar.providers],
      calendar.imports,
    );
    commands = module.get(CommandBus);
    ana = await givenAUser(module, 'ana@example.com', 'ana');
    rui = await givenAUser(module, 'rui@example.com', 'rui');
    lia = await givenAUser(module, 'lia@example.com', 'lia');
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('revises the details and moves the dates, one event for each', async () => {
    const event = await givenAnEvent(module, ana, [rui]);
    const startDate = new Date('2026-10-02T09:00:00.000Z');
    const endDate = new Date('2026-10-02T12:00:00.000Z');

    await execute(event.id, {
      details: { title: CalendarEventTitle.parse('Retro'), description: null },
      window: { startDate, endDate },
    });

    expect(events.events).toEqual([
      new CalendarEventUpdatedEvent(
        event.id.value,
        'Retro',
        null,
        'green',
        ana.id.value,
        [rui.id.value],
        null,
        expect.any(Date),
      ),
      new CalendarEventRescheduledEvent(
        event.id.value,
        startDate,
        endDate,
        event.window.startDate,
        event.window.endDate,
        1,
        expect.any(Date),
      ),
    ]);
    const revised = await saved(event.id);
    expect(revised.details.description).toBeNull();
    expect(revised.window).toMatchObject({ startDate, endDate });
  });

  it('moves only the end when only the end is given', async () => {
    const event = await givenAnEvent(module, ana);
    const endDate = new Date('2026-10-01T18:00:00.000Z');

    await execute(event.id, { window: { endDate } });

    expect(events.ofType(CalendarEventRescheduledEvent)).toHaveLength(1);
    expect(events.ofType(CalendarEventUpdatedEvent)).toEqual([]);
    expect((await saved(event.id)).window).toMatchObject({
      startDate: event.window.startDate,
      endDate,
    });
  });

  it('hands the event over and replaces the participants', async () => {
    const event = await givenAnEvent(module, ana, [rui]);

    await execute(event.id, {
      responsibleId: rui.id,
      participantIds: [lia.id],
    });

    const revised = await saved(event.id);
    expect(revised.responsible.id.equals(rui.id)).toBe(true);
    expect(revised.participants.getIdentifiers()).toEqual([lia.id]);
  });

  it('assigns a team on top of the participants it had, and null takes it away again', async () => {
    const event = await givenAnEvent(module, ana, [rui]);
    const team = await givenATeam(module, [
      calendar.identities.signUp('lia@example.com', 'lia'),
    ]);

    await execute(event.id, { teamId: team.id });
    const assigned = await saved(event.id);
    await execute(event.id, { teamId: null });
    const cleared = await saved(event.id);

    expect(assigned.team?.id.equals(team.id)).toBe(true);
    expect(
      assigned.participants
        .getItems()
        .map((user) => user.name.value)
        .sort(),
    ).toEqual(['lia', 'rui']);
    expect(cleared.team).toBeNull();
    expect(cleared.participants.count()).toBe(2);
  });

  it('refuses an event that does not exist', async () => {
    await expect(
      execute(CalendarEventId.generate(), {
        details: { title: CalendarEventTitle.parse('Retro') },
      }),
    ).rejects.toThrow(CalendarEventNotFoundException);
    expect(events.events).toEqual([]);
  });
});
