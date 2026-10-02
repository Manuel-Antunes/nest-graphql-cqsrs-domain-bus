import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { A2aCallers } from '@nestposts/ai/a2a/server/a2a-callers';

import { PlatformCaller } from '../caller/platform-caller';

export class CallerNotAuthorizedError extends Error {
  constructor() {
    super(
      'The posts MCP server refused the caller’s access token: it must carry the MCP resource as an audience and be unexpired.',
    );
    this.name = 'CallerNotAuthorizedError';
  }
}

export class CallerBearerAuthProvider implements OAuthClientProvider {
  constructor(private readonly callers: A2aCallers) {}

  get redirectUrl(): undefined {
    return undefined;
  }

  get clientMetadata(): OAuthClientMetadata {
    return { redirect_uris: [] };
  }

  clientInformation(): undefined {
    return undefined;
  }

  tokens(): OAuthTokens | undefined {
    const caller = this.callers.currentAs(PlatformCaller);
    return caller
      ? { access_token: caller.accessToken, token_type: 'Bearer' }
      : undefined;
  }

  saveTokens(): void {}

  redirectToAuthorization(): never {
    throw new CallerNotAuthorizedError();
  }

  saveCodeVerifier(): void {}

  codeVerifier(): never {
    throw new CallerNotAuthorizedError();
  }
}
