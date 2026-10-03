import { AgentRunContext } from '@nestposts/ai/agents/context/agent-run-context';
import { UserIdentity } from '@nestposts/auth/domain/auth/vo/user-identity';

import { PlatformAgentContext } from '../agent-context/platform-agent-context';
import {
  CallerBearerAuthProvider,
  CallerNotAuthorizedError,
} from './caller-bearer.auth-provider';

describe('the credential the posts MCP server is called with', () => {
  const provider = new CallerBearerAuthProvider();

  it('is the caller’s own access token, for the turn they are in', () => {
    const tokens = AgentRunContext.within(
      new PlatformAgentContext(
        UserIdentity.parse({
          userId: 'user-1',
          email: 'ana@example.com',
          name: 'Ana',
          scopes: ['read:posts'],
        }),
        'the-token',
        'root',
      ),
      () => provider.tokens(),
    );

    expect(tokens).toEqual({ access_token: 'the-token', token_type: 'Bearer' });
  });

  it('is nothing outside a turn, or for a caller with no bearer', () => {
    expect(provider.tokens()).toBeUndefined();
    expect(
      AgentRunContext.within(
        { isAuthenticated: false, userName: '', tenant: '', actorId: '' },
        () => provider.tokens(),
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
