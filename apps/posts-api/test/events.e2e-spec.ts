/** biome-ignore-all lint/style/noNonNullAssertion: every result is asserted before its data is read */
import { MikroORM } from '@mikro-orm/core';
import type { INestApplication } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { inRequestContext, TENANT_MIGRATIONS } from '@nestposts/database';
import { migrate } from '@nestposts/migrator/main';
import { tenantMigrations } from '@nestposts/migrator/migrations/tenant/index';

import { AppModule } from '../src/app.module';
import { GraphqlClient } from './support/graphql-client';

interface Person {
  id: string;
  name: string;
}

interface EventNode {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  color: string;
  responsible: Person;
  participants: Person[];
  team: { id: string; name: string } | null;
}

describe('events (e2e)', () => {
  const TENANT = 'initech';
  const EVENT_FIELDS =
    'id title description startDate endDate color responsible { id name } participants { id name } team { id name }';
  const MEMBERS = '{ members { id name } }';
  const TEAMS = '{ teams { id name } }';
  const EVENTS = `query($range: EventRangeInput, $teamId: ID) { events(range: $range, teamId: $teamId) { edges { node { ${EVENT_FIELDS} } } totalCount } }`;

  let app: INestApplication;
  let owner: GraphqlClient;
  let milton: GraphqlClient;
  let samir: GraphqlClient;
  let outsider: GraphqlClient;
  let organizationId: string;
  let accountingId: string;
  let people: Record<string, string>;

  const window = {
    startDate: '2026-10-05T12:00:00.000Z',
    endDate: '2026-10-05T13:00:00.000Z',
  };

  const membersOf = async (by: GraphqlClient) => {
    const { data, errors } = await by.execute<{ members: Person[] }>(MEMBERS);
    expect(errors, JSON.stringify(errors)).toBeUndefined();
    return data!.members;
  };

  const teamsOf = async (by: GraphqlClient) => {
    const { data, errors } = await by.execute<{ teams: Person[] }>(TEAMS);
    expect(errors, JSON.stringify(errors)).toBeUndefined();
    return data!.teams;
  };

  const meOf = async (by: GraphqlClient) => {
    const { data, errors } = await by.execute<{ me: Person }>(
      '{ me { id name } }',
    );
    expect(errors, JSON.stringify(errors)).toBeUndefined();
    return data!.me;
  };

  const addMember = (userId: string, organization: string) => {
    const members = app.get<BetterAuth>(BETTER_AUTH).api as unknown as {
      addMember(input: { body: Record<string, unknown> }): Promise<unknown>;
    };
    return inRequestContext(app.get(MikroORM).em, () =>
      members.addMember({
        body: { userId, organizationId: organization, role: 'member' },
      }),
    );
  };

  const eventsOf = async (
    by: GraphqlClient,
    variables: Record<string, unknown> = {},
  ) => {
    const { data, errors } = await by.execute<{
      events: { edges: { node: EventNode }[]; totalCount: number };
    }>(EVENTS, variables);
    expect(errors, JSON.stringify(errors)).toBeUndefined();
    return data!.events.edges.map((edge) => edge.node);
  };

  const mutate = async <T extends string>(
    by: GraphqlClient,
    mutation: T,
    type: string,
    input: Record<string, unknown>,
  ) =>
    by.execute<Record<T, EventNode>>(
      `mutation($input: ${type}!) { ${mutation}(input: $input) { ${EVENT_FIELDS} } }`,
      { input },
    );

  const created = async (
    by: GraphqlClient,
    mutation: 'createEvent' | 'createMyEvent',
    input: Record<string, unknown>,
  ): Promise<EventNode> => {
    const type =
      mutation === 'createEvent' ? 'CreateEventInput' : 'CreateMyEventInput';
    const { data, errors } = await mutate(by, mutation, type, {
      ...window,
      ...input,
    });
    expect(errors, JSON.stringify(errors)).toBeUndefined();
    return data![mutation];
  };

  const codeOf = (result: {
    errors?: readonly { extensions?: Record<string, unknown> }[];
  }) => result.errors?.[0]?.extensions?.code;

  beforeAll(async () => {
    await migrate();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TENANT_MIGRATIONS)
      .useValue({ migrationsList: tenantMigrations })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.listen(0, '127.0.0.1');

    owner = await GraphqlClient.for(app);
    milton = await GraphqlClient.for(app);
    samir = await GraphqlClient.for(app);
    outsider = await GraphqlClient.for(app);
    const billsCredential = await owner.signUp(
      'bill@initech.example.com',
      'Bill',
    );
    organizationId = await owner.createOrganization('Initech', TENANT);
    const miltonsCredential = await milton.signUp(
      'milton@initech.example.com',
      'Milton',
    );
    const samirsCredential = await samir.signUp(
      'samir@initech.example.com',
      'Samir',
    );
    for (const [client, userId] of [
      [milton, miltonsCredential],
      [samir, samirsCredential],
    ] as const) {
      await addMember(userId, organizationId);
      await client.auth('organization/set-active', { organizationId });
    }
    ({ id: accountingId } = await owner.auth<{ id: string }>(
      'organization/create-team',
      { name: 'Accounting', organizationId },
    ));
    for (const userId of [miltonsCredential, samirsCredential]) {
      await owner.auth('organization/add-team-member', {
        teamId: accountingId,
        userId,
      });
    }
    await outsider.signUp('peter@elsewhere.example.com', 'Peter');
    await addMember(
      billsCredential,
      await outsider.createOrganization('Elsewhere', 'elsewhere'),
    );

    for (const client of [owner, milton, samir]) {
      client.inTenant(TENANT);
    }
    people = Object.fromEntries(
      (await membersOf(owner)).map((person) => [person.name, person.id]),
    );
  });

  afterAll(async () => {
    for (const client of [owner, milton, samir, outsider]) {
      await client.dispose();
    }
    await app.close();
  });

  describe('members and teams', () => {
    it('lists the members of the organization and its teams, with the ids an event speaks', async () => {
      const [me, members, teams] = await Promise.all([
        meOf(owner),
        membersOf(owner),
        teamsOf(owner),
      ]);

      expect(members.map((person) => person.name).sort()).toEqual([
        'Bill',
        'Milton',
        'Samir',
      ]);
      expect(members).toContainEqual(me);
      expect(teams.map((team) => team.name)).toContain('Accounting');
    });

    it('in the root tenant, has no teams and only the caller', async () => {
      expect(await teamsOf(outsider)).toEqual([]);
      expect((await membersOf(outsider)).map((person) => person.name)).toEqual([
        'Peter',
      ]);
    });

    it('asked all at once by a newcomer to a tenant, provisions them one profile', async () => {
      const newcomer = await GraphqlClient.for(app);
      try {
        await newcomer.signUp('gavin@hooli.example.com', 'Gavin');
        await newcomer.createOrganization('Hooli', 'hooli');
        newcomer.inTenant('hooli');

        const [me, members, again] = await Promise.all([
          meOf(newcomer),
          membersOf(newcomer),
          meOf(newcomer),
          eventsOf(newcomer),
        ]);

        expect(members).toEqual([me]);
        expect(again).toEqual(me);
      } finally {
        await newcomer.dispose();
      }
    });
  });

  describe('creating', () => {
    it('createMyEvent makes the caller the responsible, whoever the caller is', async () => {
      const event = await created(milton, 'createMyEvent', {
        title: 'Stapler inventory',
        participantIds: [people.Samir],
      });

      expect(event).toMatchObject({
        title: 'Stapler inventory',
        description: null,
        color: 'blue',
        startDate: window.startDate,
        endDate: window.endDate,
        responsible: { id: people.Milton, name: 'Milton' },
        participants: [{ id: people.Samir, name: 'Samir' }],
        team: null,
      });
    });

    it('createEvent, by who manages the calendar, adds the team to the participants', async () => {
      const event = await created(owner, 'createEvent', {
        title: 'TPS reports',
        color: 'red',
        responsibleId: people.Milton,
        teamId: accountingId,
      });

      expect(event.responsible.name).toBe('Milton');
      expect(event.participants.map((person) => person.name)).toEqual([
        'Samir',
      ]);
      expect(event.team).toEqual({ id: accountingId, name: 'Accounting' });
    });

    it('createEvent is refused where the active organization is not the tenant, even to who manages that one', async () => {
      const elsewhere = await mutate(
        owner.inTenant('elsewhere'),
        'createEvent',
        'CreateEventInput',
        { ...window, title: 'Not my calendar', responsibleId: people.Bill },
      );
      const root = await mutate(
        owner.inTenant(undefined),
        'createEvent',
        'CreateEventInput',
        { ...window, title: 'Nobody’s calendar', responsibleId: people.Bill },
      );
      owner.inTenant(TENANT);

      expect(codeOf(elsewhere)).toBe('FORBIDDEN');
      expect(codeOf(root)).toBe('FORBIDDEN');
    });

    it('createEvent is refused to a member', async () => {
      const result = await mutate(milton, 'createEvent', 'CreateEventInput', {
        ...window,
        title: 'Not mine to plan',
        responsibleId: people.Samir,
      });

      expect(codeOf(result)).toBe('FORBIDDEN');
    });

    it('refuses an event that ends before it starts, and a team of another organization', async () => {
      const backwards = await mutate(
        milton,
        'createMyEvent',
        'CreateMyEventInput',
        {
          title: 'Backwards',
          startDate: window.endDate,
          endDate: window.startDate,
        },
      );
      const teams = await teamsOf(outsider.inTenant('elsewhere'));
      outsider.inTenant(undefined);
      const foreign = await mutate(
        milton,
        'createMyEvent',
        'CreateMyEventInput',
        { ...window, title: 'Foreign', teamId: teams[0].id },
      );

      expect(codeOf(backwards)).toBe('BAD_USER_INPUT');
      expect(codeOf(foreign)).toBe('NOT_FOUND');
    });
  });

  describe('reading', () => {
    it('shows who manages the calendar every event, and anybody else the ones they attend', async () => {
      const lonely = await created(owner, 'createMyEvent', {
        title: 'Bill alone',
      });

      const everything = (await eventsOf(owner)).map((event) => event.id);
      const miltons = (await eventsOf(milton)).map((event) => event.id);

      expect(everything).toContain(lonely.id);
      expect(miltons).not.toContain(lonely.id);
      expect(miltons.length).toBeGreaterThan(0);
    });

    it('narrows to a range and to a team', async () => {
      const october = await created(owner, 'createMyEvent', {
        title: 'Only in November',
        startDate: '2026-11-10T12:00:00.000Z',
        endDate: '2026-11-10T13:00:00.000Z',
      });

      const inNovember = await eventsOf(owner, {
        range: {
          from: '2026-11-01T00:00:00.000Z',
          to: '2026-11-30T23:59:59.000Z',
        },
      });
      const accounting = await eventsOf(owner, { teamId: accountingId });

      expect(inNovember.map((event) => event.id)).toEqual([october.id]);
      expect(accounting.every((event) => event.team?.id === accountingId)).toBe(
        true,
      );
      expect(accounting.length).toBeGreaterThan(0);
    });
  });

  describe('changing', () => {
    it('updateEvent moves the dates and takes the team away', async () => {
      const event = await created(owner, 'createEvent', {
        title: 'Budget',
        responsibleId: people.Bill,
        teamId: accountingId,
      });

      const { data, errors } = await mutate(
        owner,
        'updateEvent',
        'UpdateEventInput',
        {
          id: event.id,
          startDate: '2026-10-06T12:00:00.000Z',
          endDate: '2026-10-06T14:00:00.000Z',
          teamId: null,
        },
      );

      expect(errors, JSON.stringify(errors)).toBeUndefined();
      expect(data!.updateEvent).toMatchObject({
        title: 'Budget',
        startDate: '2026-10-06T12:00:00.000Z',
        endDate: '2026-10-06T14:00:00.000Z',
        team: null,
      });
      expect(
        data!.updateEvent.participants.map((person) => person.name).sort(),
      ).toEqual(['Milton', 'Samir']);
    });

    it('updateEvent and deleteEvent are refused to a member, even on their own event', async () => {
      const mine = await created(milton, 'createMyEvent', { title: 'Mine' });

      const update = await mutate(milton, 'updateEvent', 'UpdateEventInput', {
        id: mine.id,
        title: 'Still mine',
      });
      const removal = await milton.execute(
        'mutation($id: ID!) { deleteEvent(id: $id) }',
        { id: mine.id },
      );

      expect(codeOf(update)).toBe('FORBIDDEN');
      expect(codeOf(removal)).toBe('FORBIDDEN');
    });

    it('deleteEvent takes the event off the calendar', async () => {
      const doomed = await created(owner, 'createMyEvent', {
        title: 'Fire drill',
      });

      const { data, errors } = await owner.execute<{ deleteEvent: boolean }>(
        'mutation($id: ID!) { deleteEvent(id: $id) }',
        { id: doomed.id },
      );

      expect(errors, JSON.stringify(errors)).toBeUndefined();
      expect(data!.deleteEvent).toBe(true);
      expect((await eventsOf(owner)).map((event) => event.id)).not.toContain(
        doomed.id,
      );
    });
  });
});
