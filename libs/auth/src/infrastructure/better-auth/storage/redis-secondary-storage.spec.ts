import { inRequestContext } from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { RecordingOnDemandNotifications } from '@nestposts/notifications/testing/recording-on-demand-notifications';
import { RedisConnection } from '@nestposts/redis';
import { ThrowawayRedis } from '@nestposts/redis/testing/throwaway-redis';
import type { SecondaryStorage } from 'better-auth';
import { mikroOrmAdapter } from 'better-auth-mikro-orm';

import { authConfig } from '../../../config/auth.config';
import { authEntities } from '../../persistence/auth-entities';
import { BetterAuthEmails } from '../emails/better-auth-emails';
import { BetterAuthInstance } from '../init-auth';
import { BetterAuthPlugins } from '../plugins/registry';
import { RedisSecondaryStorage } from './redis-secondary-storage';

describe('sessions in Redis, in front of the database', () => {
  let redis: ThrowawayRedis;
  let connection: RedisConnection;
  let storage: RedisSecondaryStorage;
  let orm: AnyMikroORM;
  let withRedis: ReturnType<typeof build>;
  let withoutRedis: ReturnType<typeof build>;

  const build = (secondaryStorage: SecondaryStorage | null) => {
    const config = {
      ...authConfig(),
      requireEmailVerification: false,
      rateLimit: false,
    };
    const notifications = new RecordingOnDemandNotifications();
    const emails = new BetterAuthEmails(notifications);
    const plugins = BetterAuthPlugins.build(BetterAuthPlugins.providersWith(), [
      [authConfig.KEY, config],
      [BetterAuthEmails, emails],
      [OnDemandNotifications, notifications],
    ]);
    return BetterAuthInstance.create(
      config,
      mikroOrmAdapter(orm),
      plugins,
      emails,
      { secondaryStorage },
    );
  };

  const inContext = <T>(work: () => Promise<T>): Promise<T> =>
    inRequestContext(orm.em, work);

  const signUp = async (auth: ReturnType<typeof build>, name: string) => {
    const { headers, response } = await inContext(() =>
      auth.api.signUpEmail({
        body: {
          email: `${name}-${Date.now()}@example.com`,
          name,
          password: 'senha-super-secreta',
        },
        returnHeaders: true,
      }),
    );
    const cookie = headers
      .getSetCookie()
      .map((entry: string) => entry.split(';')[0])
      .join('; ');
    return { cookie, token: response.token as string };
  };

  const sessionOf = (auth: ReturnType<typeof build>, cookie: string) =>
    inContext(() => auth.api.getSession({ headers: new Headers({ cookie }) }));

  const rowOf = (token: string) =>
    inContext(async () =>
      (await withRedis.$context).adapter.findOne({
        model: 'session',
        where: [{ field: 'token', value: token }],
      }),
    );

  beforeAll(async () => {
    redis = await ThrowawayRedis.start();
    connection = await RedisConnection.open({ url: redis.url });
    storage = new RedisSecondaryStorage(connection);
    orm = await testDatabase({ entities: authEntities }, 'redis_storage');
    withRedis = build(storage);
    withoutRedis = build(null);
  }, 120_000);

  afterAll(async () => {
    await connection?.onApplicationShutdown();
    await redis?.stop();
    await closeTestDatabase(orm);
  });

  describe('the storage', () => {
    it('keeps every key under its own prefix, with the time to live it was given', async () => {
      await storage.set('k', 'v', 30);

      await expect(storage.get('k')).resolves.toBe('v');
      await expect(connection.client.ttl('better-auth:k')).resolves.toBe(30);
      await expect(connection.client.get('k')).resolves.toBeNull();
    });

    it('takes a value and removes it in one step', async () => {
      await storage.set('once', 'value');

      await expect(storage.getAndDelete('once')).resolves.toBe('value');
      await expect(storage.get('once')).resolves.toBeNull();
    });

    it('counts, and starts the window only on the first increment', async () => {
      await expect(storage.increment('window', 60)).resolves.toBe(1);
      await connection.client.expire('better-auth:window', 5);
      await expect(storage.increment('window', 60)).resolves.toBe(2);

      await expect(
        connection.client.ttl('better-auth:window'),
      ).resolves.toBeLessThanOrEqual(5);
    });
  });

  it('writes a new session to Redis and to the database', async () => {
    const { token } = await signUp(withRedis, 'ana');

    await expect(storage.get(token)).resolves.toContain(token);
    await expect(rowOf(token)).resolves.toMatchObject({ token });
  });

  it('answers a session from Redis, without reading the database', async () => {
    const { cookie, token } = await signUp(withRedis, 'bruno');
    await inContext(async () =>
      (await withRedis.$context).adapter.delete({
        model: 'session',
        where: [{ field: 'token', value: token }],
      }),
    );

    const session = await sessionOf(withRedis, cookie);

    expect(session?.session.token).toBe(token);
  });

  it('still answers a session issued before Redis existed, from its row', async () => {
    const { cookie, token } = await signUp(withoutRedis, 'carla');
    await expect(storage.get(token)).resolves.toBeNull();

    const session = await sessionOf(withRedis, cookie);

    expect(session?.session.token).toBe(token);
  });

  it('forgets a session in both places when it is signed out', async () => {
    const { cookie, token } = await signUp(withRedis, 'diana');

    await inContext(() =>
      withRedis.api.signOut({ headers: new Headers({ cookie }) }),
    );

    await expect(storage.get(token)).resolves.toBeNull();
    await expect(rowOf(token)).resolves.toBeNull();
    await expect(sessionOf(withRedis, cookie)).resolves.toBeNull();
  });

  it('forgets everything it keeps, and nothing else in the same Redis', async () => {
    const { cookie } = await signUp(withRedis, 'elisa');
    await connection.client.set('cache::cache:organization', 'kept');

    await expect(storage.clear()).resolves.toBeGreaterThan(0);

    await expect(
      connection.client.keys(`${RedisSecondaryStorage.KEY_PREFIX}*`),
    ).resolves.toEqual([]);
    await expect(
      connection.client.get('cache::cache:organization'),
    ).resolves.toBe('kept');
    await expect(sessionOf(withRedis, cookie)).resolves.not.toBeNull();
  });

  it('can still reserve a verification value, which magic link and email OTP depend on', async () => {
    const reserved = await inContext(async () =>
      (await withRedis.$context).internalAdapter.reserveVerificationValue({
        identifier: `reservation-${Date.now()}`,
        value: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );

    expect(reserved).toBeTruthy();
  });
});
