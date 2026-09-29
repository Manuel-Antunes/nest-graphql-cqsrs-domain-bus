import { OAUTH_SCOPES } from '../../../domain/auth/scopes';
import { BetterAuthIdentityResolver } from './better-auth-identity.resolver';

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
});
