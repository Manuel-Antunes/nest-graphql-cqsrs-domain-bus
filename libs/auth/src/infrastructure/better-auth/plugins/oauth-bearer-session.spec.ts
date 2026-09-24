import { inRequestContext } from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { RecordingOnDemandNotifications } from '@nestposts/notifications/testing/recording-on-demand-notifications';
import { mikroOrmAdapter } from 'better-auth-mikro-orm';

import { authEntities } from '../../persistence/auth-entities';
import { AuthConfiguration } from '../config';
import { BetterAuthEmails } from '../emails/better-auth-emails';
import { BetterAuthInstance } from '../init-auth';
import { BETTER_AUTH_CONFIG } from '../tokens';
import { BetterAuthPlugins } from './registry';

const ISSUER = 'http://localhost:4200';
const GATEWAY = 'http://localhost:4000/graphql';

describe('an OAuth access token is a session', () => {
  let orm: AnyMikroORM;
  let auth: ReturnType<typeof build>;

  const build = () => {
    const config = AuthConfiguration.fromEnvironment({
      AUTH_URL: 'http://localhost:3000',
      WEB_URL: ISSUER,
      GATEWAY_URL: GATEWAY,
    } as NodeJS.ProcessEnv);
    const notifications = new RecordingOnDemandNotifications();
    const emails = new BetterAuthEmails(notifications);
    const plugins = BetterAuthPlugins.build(BetterAuthPlugins.providersWith(), [
      [BETTER_AUTH_CONFIG, config],
      [BetterAuthEmails, emails],
      [OnDemandNotifications, notifications],
    ]);
    return BetterAuthInstance.create(
      config,
      mikroOrmAdapter(orm),
      plugins,
      emails,
    );
  };

  const inContext = <T>(work: () => Promise<T>): Promise<T> =>
    inRequestContext(orm.em, work);

  const givenAUser = (email: string, extra: Record<string, unknown> = {}) =>
    inContext(async () =>
      (await auth.$context).internalAdapter.createUser(
        { email, name: 'Ana', emailVerified: true, ...extra },
        { method: 'admin' },
      ),
    );

  const tokenFor = async (payload: Record<string, unknown>) =>
    (await inContext(() => auth.api.signJWT({ body: { payload } }))).token;

  const sessionFor = (authorization: string) =>
    inContext(() =>
      auth.api.getSession({ headers: new Headers({ authorization }) }),
    );

  beforeAll(async () => {
    orm = await testDatabase({ entities: authEntities }, 'bearer');
    auth = build();
  });

  afterAll(() => closeTestDatabase(orm));

  it('answers as the user an access token for the gateway was issued to', async () => {
    const user = await givenAUser('ana-bearer@example.com');

    const session = await sessionFor(
      `Bearer ${await tokenFor({ sub: user.id, aud: GATEWAY, scope: 'openid' })}`,
    );

    expect(session?.user).toMatchObject({
      id: user.id,
      email: 'ana-bearer@example.com',
    });
    expect(session?.session.userId).toBe(user.id);
    expect(session?.session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses a token addressed to another resource, or signed for another issuer', async () => {
    const user = await givenAUser('bia-bearer@example.com');

    await expect(
      sessionFor(
        `Bearer ${await tokenFor({ sub: user.id, aud: 'http://elsewhere' })}`,
      ),
    ).resolves.toBeNull();
    await expect(
      sessionFor(
        `Bearer ${await tokenFor({ sub: user.id, aud: GATEWAY, iss: 'http://impostor' })}`,
      ),
    ).resolves.toBeNull();
  });

  it('answers no session for a user who no longer exists, or who is banned', async () => {
    const banned = await givenAUser('rui-bearer@example.com', { banned: true });

    await expect(
      sessionFor(`Bearer ${await tokenFor({ sub: 'nobody', aud: GATEWAY })}`),
    ).resolves.toBeNull();
    await expect(
      sessionFor(`Bearer ${await tokenFor({ sub: banned.id, aud: GATEWAY })}`),
    ).resolves.toBeNull();
  });

  it('leaves anything that is not a signed token to Better Auth', async () => {
    await expect(sessionFor('Bearer opaque-session-token')).resolves.toBeNull();
    await expect(sessionFor('Basic dXNlcjpwYXNz')).resolves.toBeNull();
  });
});
