import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import {
  inRequestContext,
  MikroORM,
  ROOT_TENANT_SCHEMA,
  TENANT_MIGRATIONS,
} from '@nestposts/database';
import { migrate } from '@nestposts/migrator/main';
import { tenantMigrations } from '@nestposts/migrator/migrations/tenant/index';
import { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { AppModule } from '../src/app.module';

interface Caller {
  readonly cookie: string;
  readonly user: User;
}

interface Answer {
  data?: Record<string, unknown> | null;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

describe('the notifications subgraph', () => {
  let app: NestFastifyApplication;
  let url: string;

  const em = () => app.get(MikroORM).em.fork({ schema: ROOT_TENANT_SCHEMA });

  const execute = async (
    query: string,
    variables: Record<string, unknown> = {},
    caller?: Caller,
  ): Promise<Answer> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(caller ? { cookie: caller.cookie } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as Answer;
  };

  const signedUp = async (name: string, profile = true): Promise<Caller> => {
    const email = `${name.toLowerCase()}-${UserId.generate().value}@example.com`;
    const auth = app.get<BetterAuth>(BETTER_AUTH);
    const { headers } = await inRequestContext(app.get(MikroORM), () =>
      auth.api.signUpEmail({
        body: { email, name, password: 'senha-super-secreta' },
        returnHeaders: true,
      }),
    );
    const cookie = headers
      .getSetCookie()
      .map((entry: string) => entry.split(';')[0])
      .join('; ');
    const user = User.register(
      UserId.generate(),
      { email, name },
      [],
      new Date(),
    );
    user.uncommit();
    if (profile) await em().persist(user).flush();
    return { cookie, user };
  };

  const givenANotification = async (user: User, title: string, at: Date) => {
    const record = NotificationRecord.draft('posts.PostCreated', { title });
    record.addressTo(
      {
        notifiableType: user.notifiableType,
        notifiableId: user.notifiableId,
        notifiableName: null,
        routeNotificationFor: () => undefined,
      },
      at,
    );
    await em().persist(record).flush();
    return record;
  };

  beforeAll(async () => {
    await migrate();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TENANT_MIGRATIONS)
      .useValue({ migrationsList: tenantMigrations })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    await app.listen(0, '127.0.0.1');
    url = `${(await app.getUrl()).replace('[::1]', '127.0.0.1')}/graphql`;
  });

  afterAll(() => app?.close());

  it('refuses the root fields to a caller with no session', async () => {
    const answer = await execute('{ unreadNotificationCount }');

    expect(answer.errors?.[0].extensions).toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('answers nothing, and no error, to a session whose user has no profile yet', async () => {
    const newcomer = await signedUp('Newcomer', false);

    const answer = await execute(
      '{ unreadNotificationCount notifications { id } }',
      {},
      newcomer,
    );

    expect(answer).toEqual({
      data: { unreadNotificationCount: 0, notifications: [] },
    });
  });

  it('lists, counts, marks all as read and deletes the reader’s own notifications — and nobody else’s', async () => {
    const ana = await signedUp('Ana');
    const bia = await signedUp('Bia');
    const older = await givenANotification(
      ana.user,
      'older',
      new Date('2026-09-01'),
    );
    const newer = await givenANotification(
      ana.user,
      'newer',
      new Date('2026-09-02'),
    );
    const theirs = await givenANotification(bia.user, 'not mine', new Date());

    const listed = await execute(
      '{ unreadNotificationCount notifications { id data read } }',
      {},
      ana,
    );
    expect(listed.data).toEqual({
      unreadNotificationCount: 2,
      notifications: [
        { id: newer.id.value, data: { title: 'newer' }, read: false },
        { id: older.id.value, data: { title: 'older' }, read: false },
      ],
    });

    const marked = await execute(
      'mutation { markAllNotificationsAsRead }',
      {},
      ana,
    );
    expect(marked.data).toEqual({ markAllNotificationsAsRead: 2 });

    const deleted = await execute(
      'mutation($id: ID!) { deleteNotification(id: $id) }',
      { id: older.id.value },
      ana,
    );
    expect(deleted.data).toEqual({ deleteNotification: older.id.value });
    expect(await em().findOne(NotificationRecord, { id: older.id })).toBeNull();

    const refused = await execute(
      'mutation($id: ID!) { deleteNotification(id: $id) }',
      { id: theirs.id.value },
      ana,
    );
    expect(refused.errors?.[0].extensions).toMatchObject({ code: 'NOT_FOUND' });
    expect(
      await em().findOne(NotificationRecord, { id: theirs.id }),
    ).not.toBeNull();
    expect(
      (
        await execute(
          'query($id: ID!) { notification(id: $id) { id } }',
          { id: theirs.id.value },
          ana,
        )
      ).data,
    ).toEqual({ notification: null });
  });

  it('contributes notifications to IUser — answered to their owner, and to nobody else', async () => {
    const rui = await signedUp('Rui');
    const eva = await signedUp('Eva');
    const mine = await givenANotification(rui.user, 'for rui', new Date());
    const entities = (caller?: Caller) =>
      execute(
        `query($representations: [_Any!]!) {
          _entities(representations: $representations) {
            ... on IUser { id unreadNotificationCount notifications { id } }
          }
        }`,
        { representations: [{ __typename: 'IUser', id: rui.user.id.value }] },
        caller,
      );

    expect((await entities(rui)).data).toEqual({
      _entities: [
        {
          id: rui.user.id.value,
          unreadNotificationCount: 1,
          notifications: [{ id: mine.id.value }],
        },
      ],
    });
    expect((await entities(eva)).data).toEqual({
      _entities: [
        {
          id: rui.user.id.value,
          unreadNotificationCount: 0,
          notifications: [],
        },
      ],
    });
    expect((await entities()).data).toEqual({
      _entities: [
        {
          id: rui.user.id.value,
          unreadNotificationCount: 0,
          notifications: [],
        },
      ],
    });
  });

  it('registers a push token for the reader, and forgets it', async () => {
    const ana = await signedUp('Pixel');

    const registered = await execute(
      'mutation($input: RegisterDeviceInput!) { registerDevice(input: $input) { deviceId platform } }',
      {
        input: {
          token: `fcm-${ana.user.id.value}`,
          deviceId: 'pixel-8',
          platform: 'android',
        },
      },
      ana,
    );
    const removed = await execute(
      'mutation($token: String!) { removeDevice(token: $token) }',
      { token: `fcm-${ana.user.id.value}` },
      ana,
    );

    expect(registered.data).toEqual({
      registerDevice: { deviceId: 'pixel-8', platform: 'android' },
    });
    expect(removed.data).toEqual({ removeDevice: true });
  });
});
