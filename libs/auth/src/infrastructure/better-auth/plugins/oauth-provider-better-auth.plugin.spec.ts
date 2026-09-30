import { APIError } from 'better-auth/api';

import {
  OAUTH_CLIENT_ADMIN_REQUIRED,
  OAuthClientClaims,
  oauthClientPrivileges,
} from './oauth-provider-better-auth.plugin';

const refusal = (action: string, role: string): APIError | undefined => {
  try {
    oauthClientPrivileges({ action, user: { role } });
    return undefined;
  } catch (error) {
    return error as APIError;
  }
};

describe('oauthClientPrivileges', () => {
  it('lets anybody signed in read and list the clients', () => {
    expect(
      oauthClientPrivileges({ action: 'read', user: { role: 'user' } }),
    ).toBe(true);
    expect(
      oauthClientPrivileges({ action: 'list', user: { role: 'author' } }),
    ).toBe(true);
  });

  it('lets an admin create, update, rotate and delete one, whatever else they are', () => {
    for (const action of ['create', 'update', 'rotate', 'delete']) {
      expect(
        oauthClientPrivileges({ action, user: { role: 'user,admin' } }),
      ).toBe(true);
    }
  });

  it('refuses anybody else with a 403 that says why, not a 401 that reads as signed out', () => {
    const error = refusal('create', 'user');

    expect(error).toBeInstanceOf(APIError);
    expect(error?.statusCode).toBe(403);
    expect(error?.body).toMatchObject({
      code: OAUTH_CLIENT_ADMIN_REQUIRED,
      message: 'Only an admin can create an OAuth client',
    });
  });
});

describe('OAuthClientClaims', () => {
  it('copies the claims a client declares in its metadata into its tokens', () => {
    expect(
      OAuthClientClaims.of({
        claims: { agent_bot_id: 7, organization_id: 'org-1' },
        other: 'ignored',
      }),
    ).toEqual({ agent_bot_id: 7, organization_id: 'org-1' });
  });

  it('adds nothing for a client that declares none, or declares them malformed', () => {
    expect(OAuthClientClaims.of(undefined)).toEqual({});
    expect(OAuthClientClaims.of({})).toEqual({});
    expect(OAuthClientClaims.of({ claims: ['agent_bot_id'] })).toEqual({});
    expect(OAuthClientClaims.of({ claims: 'agent_bot_id' })).toEqual({});
  });
});

describe('OAuthClientClaims.forAccessToken', () => {
  const metadata = { claims: { agent_bot_id: 7, organization_id: 'declared' } };

  it('binds a client’s own token to the organization it was registered for, over whatever it declares', () => {
    expect(
      OAuthClientClaims.forAccessToken({
        metadata,
        client: { referenceId: 'org-acme' },
        grantType: 'client_credentials',
      }),
    ).toEqual({ agent_bot_id: 7, organization_id: 'org-acme' });
  });

  it('binds no organization to a token issued on a user’s behalf, nor for a client registered for none', () => {
    expect(
      OAuthClientClaims.forAccessToken({
        client: { referenceId: 'org-acme' },
        grantType: 'authorization_code',
      }),
    ).toEqual({});
    expect(
      OAuthClientClaims.forAccessToken({
        client: { referenceId: null },
        grantType: 'client_credentials',
      }),
    ).toEqual({});
  });
});
