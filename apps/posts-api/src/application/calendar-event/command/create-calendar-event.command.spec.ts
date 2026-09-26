import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { ROOT_TENANT } from '@nestposts/database';
import { CalendarEvent } from '@nestposts/events/domain/calendar-event/calendar-event.entity';
import { CalendarEventCreatedEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-created.event';
import { CalendarEventDetails } from '@nestposts/events/domain/calendar-event/vo/calendar-event-details';
import { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import { CalendarEventWindow } from '@nestposts/events/domain/calendar-event/vo/calendar-event-window';
import { TeamNotFoundException } from '@nestposts/organizations/domain/organization/exception/team-not-found.exception';
import { UserNotFoundException } from '@nestposts/users/domain/user/exception/user-not-found.exception';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { CalendarTesting } from '../../../../test/support/calendar-fixtures';
import {
  anOrganization,
  calendarTesting,
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
import { CreateCalendarEventCommand } from './create-calendar-event.command';

describe('CreateCalendarEventCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;
  let calendar: CalendarTesting;
  let ana: User;
  let rui: User;

  const window = CalendarEventWindow.between(
    new Date('2026-10-01T09:00:00.000Z'),
    new Date('2026-10-01T10:00:00.000Z'),
  );

  const aCommand = (
    overrides: Partial<CreateCalendarEventCommand.NewEvent> = {},
    id = CalendarEventId.generate(),
  ) =>
    new CreateCalendarEventCommand.CreateCalendarEvent(id, {
      details: CalendarEventDetails.parse({
        title: ' Planning ',
        description: 'Sprint planning',
      }),
      window,
      responsibleId: ana.id,
      participantIds: [rui.id],
      ...overrides,
    });

  const execute = (
    command: CreateCalendarEventCommand.CreateCalendarEvent,
    tenant = TENANT,
  ) =>
    inRequestContext(module, () =>
      commands.execute(
        command,
        new CalendarEventRequest(command.calendarEventId, tenant),
      ),
    );

  const saved = (id: CalendarEventId) =>
    freshEm(module).findOne(
      CalendarEvent,
      { id },
      { populate: ['responsible', 'participants', 'team'] },
    );

  beforeEach(async () => {
    calendar = calendarTesting();
    module = await createCqrsTestingModule(
      [CreateCalendarEventCommand.Handler, ...calendar.providers],
      calendar.imports,
    );
    commands = module.get(CommandBus);
    ana = await givenAUser(module, 'ana@example.com', 'ana');
    rui = await givenAUser(module, 'rui@example.com', 'rui');
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('schedules the event, publishes CalendarEventCreated and answers with its id', async () => {
    const id = CalendarEventId.generate();

    const answered = await execute(aCommand({}, id));

    expect(answered.equals(id)).toBe(true);
    expect(events.events).toEqual([
      new CalendarEventCreatedEvent(
        id.value,
        'Planning',
        'Sprint planning',
        window.startDate,
        window.endDate,
        'blue',
        ana.id.value,
        [rui.id.value],
        null,
        expect.any(Date),
      ),
    ]);
    const event = await saved(id);
    expect(event?.details.title.value).toBe('Planning');
    expect(event?.window.equals(window)).toBe(true);
    expect(event?.responsible.id.equals(ana.id)).toBe(true);
    expect(event?.participants.getIdentifiers()).toEqual([rui.id]);
  });

  it('adds the members of the team to the participants, provisioning whoever had no profile here', async () => {
    const lia = calendar.identities.signUp('lia@example.com', 'lia');
    const ruisCredential = calendar.identities.signUp('rui@example.com', 'rui');
    const anasCredential = calendar.identities.signUp('ana@example.com', 'ana');
    const team = await givenATeam(module, [
      lia,
      ruisCredential,
      anasCredential,
    ]);
    const id = CalendarEventId.generate();

    await execute(aCommand({ teamId: team.id }, id));

    const event = await saved(id);
    const participants = event?.participants
      .getItems()
      .map((user) => user.name.value)
      .sort();
    expect(participants).toEqual(['lia', 'rui']);
    expect(event?.team?.id.equals(team.id)).toBe(true);
    expect(await freshEm(module).count(User)).toBe(3);
  });

  it('knows no team outside the organization of the tenant, nor any in the root tenant', async () => {
    const foreign = await givenATeam(module, [], anOrganization('elsewhere'));
    const ours = await givenATeam(module);

    await expect(execute(aCommand({ teamId: foreign.id }))).rejects.toThrow(
      TeamNotFoundException,
    );
    await expect(
      execute(aCommand({ teamId: ours.id }), ROOT_TENANT),
    ).rejects.toThrow(TeamNotFoundException);
    expect(await freshEm(module).count(CalendarEvent)).toBe(0);
    expect(events.events).toEqual([]);
  });

  it('refuses a participant who is not a user of the tenant', async () => {
    await expect(
      execute(aCommand({ participantIds: [UserId.generate()] })),
    ).rejects.toThrow(UserNotFoundException);

    expect(await freshEm(module).count(CalendarEvent)).toBe(0);
  });
});
