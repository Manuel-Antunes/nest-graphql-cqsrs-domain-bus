import { A2aCallers } from '@nestposts/ai/a2a/server/a2a-callers';
import { UserIdentity } from '@nestposts/auth/domain/auth/vo/user-identity';

import { PlatformCaller } from '../caller/platform-caller';
import {
  CallerBearerAuthProvider,
  CallerNotAuthorizedError,
} from './caller-bearer.auth-provider';

describe('the credential the posts MCP server is called with', () => {
  const callers = new A2aCallers();
  const provider = new CallerBearerAuthProvider(callers);

  it('is the caller’s own access token, for the turn they are in', () => {
    const tokens = callers.run(
      new PlatformCaller(
        UserIdentity.parse({
          userId: 'user-1',
          email: 'ana@example.com',
          name: 'Ana',
          scopes: ['read:posts'],
        }),
        'the-token',
      ),
      () => provider.tokens(),
    );

    expect(tokens).toEqual({ access_token: 'the-token', token_type: 'Bearer' });
  });

  it('is nothing outside a turn, or for a caller with no bearer', () => {
    expect(provider.tokens()).toBeUndefined();
    expect(
      callers.run({ isAuthenticated: false, userName: '' }, () =>
        provider.tokens(),
      ),
    ).toBeUndefined();
  });

  it('never starts an authorization flow of its own', () => {
    expect(provider.redirectUrl).toBeUndefined();
    expect(provider.clientInformation()).toBeUndefined();
    expect(() => provider.redirectToAuthorization()).toThrow(
      CallerNotAuthorizedError,
    );
    expect(() => provider.codeVerifier()).toThrow(CallerNotAuthorizedError);
  });
});
