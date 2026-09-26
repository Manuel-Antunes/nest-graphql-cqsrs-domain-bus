import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { CalendarEvent } from '@nestposts/events/domain/calendar-event/calendar-event.entity';
import { CalendarEventDeletedEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-deleted.event';
import { CalendarEventNotFoundException } from '@nestposts/events/domain/calendar-event/exception/calendar-event-not-found.exception';
import { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import { User } from '@nestposts/users/domain/user/user.entity';

import {
  calendarTesting,
  givenAnEvent,
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
import { DeleteCalendarEventCommand } from './delete-calendar-event.command';

describe('DeleteCalendarEventCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;

  const execute = (id: CalendarEventId) =>
    inRequestContext(module, () =>
      commands.execute(
        new DeleteCalendarEventCommand.DeleteCalendarEvent(id),
        new CalendarEventRequest(id, TENANT),
      ),
    );

  beforeEach(async () => {
    const calendar = calendarTesting();
    module = await createCqrsTestingModule(
      [DeleteCalendarEventCommand.Handler, ...calendar.providers],
      calendar.imports,
    );
    commands = module.get(CommandBus);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('deletes the event, keeps its people, and publishes CalendarEventDeleted', async () => {
    const ana = await givenAUser(module, 'ana@example.com', 'ana');
    const rui = await givenAUser(module, 'rui@example.com', 'rui');
    const event = await givenAnEvent(module, ana, [rui]);

    await execute(event.id);

    expect(events.events).toEqual([
      new CalendarEventDeletedEvent(event.id.value, expect.any(Date)),
    ]);
    expect(await freshEm(module).count(CalendarEvent)).toBe(0);
    expect(await freshEm(module).count(User)).toBe(2);
  });

  it('refuses an event that does not exist', async () => {
    await expect(execute(CalendarEventId.generate())).rejects.toThrow(
      CalendarEventNotFoundException,
    );
    expect(events.events).toEqual([]);
  });
});
