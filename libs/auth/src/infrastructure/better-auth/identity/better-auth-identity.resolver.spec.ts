import { OAUTH_SCOPES } from '../../../domain/auth/scopes';
import { ClientIdentity } from '../../../domain/auth/vo/client-identity';
import type { BetterAuth } from '../init-auth';
import type { AccessTokens } from './access-tokens';
import { BetterAuthIdentityResolver } from './better-auth-identity.resolver';

const unsigned = (claims: Record<string, unknown>) =>
  [
    Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'at+jwt' })),
    Buffer.from(JSON.stringify(claims)),
    Buffer.from('signature'),
  ]
    .map((part) => part.toString('base64url'))
    .join('.');

describe('BetterAuthIdentityResolver.fromSession', () => {
  const user = {
    id: 'ana',
    email: 'ana@example.com',
    name: 'Ana',
    role: 'user,author',
  };

  it('grants a session of this system’s own every scope', () => {
    const identity = BetterAuthIdentityResolver.fromSession({
      user,
      session: { activeOrganizationId: 'acme' },
    });

    expect(identity?.scopes).toEqual(OAUTH_SCOPES);
    expect(identity?.roles).toEqual(['user', 'author']);
    expect(identity?.activeOrganizationId).toBe('acme');
  });

  it('keeps what an OAuth access token was granted, and nothing when it was granted nothing', () => {
    expect(
      BetterAuthIdentityResolver.fromSession({
        user,
        session: { scopes: ['openid', 'read:posts'] },
      })?.scopes,
    ).toEqual(['openid', 'read:posts']);
    expect(
      BetterAuthIdentityResolver.fromSession({ user, session: { scopes: [] } })
        ?.scopes,
    ).toEqual([]);
  });

  it('is nobody without a session', () => {
    expect(BetterAuthIdentityResolver.fromSession(null)).toBeNull();
  });

  it('is a user whose credential is the session itself, with no attributes, for a cookie', () => {
    const identity = BetterAuthIdentityResolver.fromSession({
      user,
      session: { id: 'session-1', expiresAt: new Date() },
    });

    expect(identity?.kind).toBe('user');
    expect(identity?.principal).toBe('ana');
    expect(identity?.credential).toMatchObject({ type: 'session' });
    expect(identity?.attributes).toEqual({});
  });

  it('keeps an access token’s custom claims as attributes, and the token as the credential', () => {
    const expiresAt = new Date('2026-10-01T12:00:00Z');

    const identity = BetterAuthIdentityResolver.fromSession({
      user,
      session: {
        id: 'jti-1',
        expiresAt: expiresAt.toISOString(),
        scopes: ['openid'],
        claims: { plan: 'pro', seats: 3 },
      },
    });

    expect(identity?.attributes).toEqual({ plan: 'pro', seats: 3 });
    expect(identity?.credential).toMatchObject({
      type: 'access-token',
      tokenId: 'jti-1',
      expiresAt,
    });
  });
});

describe('BetterAuthIdentityResolver.identity', () => {
  const client = ClientIdentity.parse({
    clientId: 'machine',
    scopes: ['read:posts'],
    activeOrganizationId: 'org-acme',
    credential: {
      type: 'access-token',
      tokenId: 'jti-9',
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const resolverFor = (authorization: string) => {
    const read: string[] = [];
    const sessions: string[] = [];
    const accessTokens = {
      clientIdentityOf: async (token: string) => {
        read.push(token);
        return client;
      },
    } as unknown as AccessTokens;
    const auth = {
      api: {
        getSession: async () => {
          sessions.push(authorization);
          return null;
        },
      },
    } as unknown as BetterAuth;
    const resolver = new BetterAuthIdentityResolver(
      auth,
      { headers: { authorization } },
      accessTokens,
    );
    return { resolver, read, sessions };
  };

  it('reads a client’s own token as that client, and never as a session', async () => {
    const token = unsigned({ sub: 'machine', client_id: 'machine' });
    const { resolver, read, sessions } = resolverFor(`Bearer ${token}`);

    await expect(resolver.identity()).resolves.toBe(client);
    expect(read).toEqual([token]);
    expect(sessions).toEqual([]);
  });

  it('reads a token issued on a user’s behalf as a session', async () => {
    const { resolver, read, sessions } = resolverFor(
      `Bearer ${unsigned({ sub: 'ana', client_id: 'machine' })}`,
    );

    await expect(resolver.identity()).resolves.toBeNull();
    expect(read).toEqual([]);
    expect(sessions).toHaveLength(1);
  });

  it('answers from what the guard recorded, without asking again', async () => {
    const request = { headers: {} };
    BetterAuthIdentityResolver.guard(request, client);

    expect(BetterAuthIdentityResolver.guardedIdentityOf(request)).toBe(client);
    expect(request).toMatchObject({ session: null, user: null });
  });
});
