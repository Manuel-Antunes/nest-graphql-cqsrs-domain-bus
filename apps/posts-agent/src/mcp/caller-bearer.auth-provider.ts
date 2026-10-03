import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { AgentRunContext } from '@nestposts/ai/agents/context/agent-run-context';

export class CallerNotAuthorizedError extends Error {
  constructor() {
    super(
      'The posts MCP server refused the caller’s access token: it must carry the MCP resource as an audience and be unexpired.',
    );
    this.name = 'CallerNotAuthorizedError';
  }
}

export class CallerBearerAuthProvider implements OAuthClientProvider {
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
    const credential = AgentRunContext.current()?.credential;
    return credential
      ? { access_token: credential, token_type: 'Bearer' }
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
