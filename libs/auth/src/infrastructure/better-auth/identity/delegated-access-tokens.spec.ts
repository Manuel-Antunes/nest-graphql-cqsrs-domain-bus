import { inRequestContext } from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { RecordingOnDemandNotifications } from '@nestposts/notifications/testing/recording-on-demand-notifications';
import { mikroOrmAdapter } from 'better-auth-mikro-orm';
import { decodeJwt } from 'jose';

import { authConfig } from '../../../config/auth.config';
import { IdentityIsNotAUserException } from '../../../domain/auth/exception/identity-is-not-a-user.exception';
import { OAUTH_SCOPES } from '../../../domain/auth/scopes';
import { ClientIdentity } from '../../../domain/auth/vo/client-identity';
import { UserIdentity } from '../../../domain/auth/vo/user-identity';
import { authEntities } from '../../persistence/auth-entities';
import { BetterAuthEmails } from '../emails/better-auth-emails';
import { BetterAuthInstance } from '../init-auth';
import { BetterAuthPlugins } from '../plugins/registry';
import { DelegatedAccessTokens } from './delegated-access-tokens';

const AGENT = 'https://issuer.test/agui/theo';
const DELEGATE = 'https://issuer.test/a2a/posts';

describe('an access token the signed-in person delegates to an agent', () => {
  let orm: AnyMikroORM;
  let auth: ReturnType<typeof build>;
  const config = {
    ...authConfig(),
    baseUrl: 'http://localhost:4200',
    issuer: 'https://issuer.test',
    oauthResources: [AGENT],
  };

  const build = () => {
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
    );
  };

  const inContext = <T>(work: () => Promise<T>) =>
    inRequestContext(orm.em, work);

  beforeAll(async () => {
    orm = await testDatabase({ entities: authEntities }, 'delegated_tokens');
    auth = build();
  });

  afterAll(() => closeTestDatabase(orm));

  const signedIn = async () => {
    const user = await inContext(async () =>
      (await auth.$context).internalAdapter.createUser(
        {
          email: `ana-${Date.now()}@example.com`,
          name: 'Ana',
          emailVerified: true,
        },
        { method: 'admin' },
      ),
    );
    return {
      user,
      identity: UserIdentity.parse({
        userId: user.id,
        email: user.email,
        name: user.name,
        scopes: [...OAUTH_SCOPES].filter((scope) => scope !== 'write:posts'),
      }),
    };
  };

  it('reads back, wherever its audience is accepted, as the session of the person it was issued for', async () => {
    const { user, identity } = await signedIn();
    const tokens = new DelegatedAccessTokens(auth as never);

    const token = await inContext(() =>
      tokens.issueFor(identity, {
        audiences: [AGENT, DELEGATE],
        scopes: ['openid', 'read:posts', 'write:posts'],
        expiresIn: 120,
      }),
    );
    const session = await inContext(() =>
      auth.api.getSession({
        headers: new Headers({ authorization: `Bearer ${token}` }),
      }),
    );

    const claims = decodeJwt(token);
    expect(claims).toMatchObject({
      iss: 'https://issuer.test',
      sub: user.id,
      aud: [AGENT, DELEGATE],
      scope: 'openid read:posts',
    });
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(120);
    expect(session?.user.id).toBe(user.id);
    expect(
      (session?.session as { scopes?: string[] } | undefined)?.scopes,
    ).toEqual(['openid', 'read:posts']);
  });

  it('is refused to an OAuth client acting for itself', async () => {
    const tokens = new DelegatedAccessTokens(auth as never);
    const client = ClientIdentity.parse({
      clientId: 'a-client',
      scopes: ['read:posts'],
      activeOrganizationId: null,
      attributes: {},
      credential: {
        type: 'access-token',
        tokenId: 'jti-1',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(
      tokens.issueFor(client, { audiences: [AGENT], scopes: ['read:posts'] }),
    ).rejects.toThrow(IdentityIsNotAUserException);
  });
});
