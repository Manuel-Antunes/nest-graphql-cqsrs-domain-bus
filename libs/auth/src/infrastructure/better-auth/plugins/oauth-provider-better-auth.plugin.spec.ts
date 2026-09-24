import { APIError } from 'better-auth/api';

import {
  OAUTH_CLIENT_ADMIN_REQUIRED,
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
