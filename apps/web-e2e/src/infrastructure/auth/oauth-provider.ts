import type { Pkce } from './pkce';

export interface AuthorizationRequest {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scope: string;
  readonly state: string;
  readonly resource: string;
  readonly pkce: Pkce;
}

export interface CodeExchange {
  readonly code: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly resource: string;
  readonly pkce: Pkce;
}

export class OAuthProvider {
  constructor(private readonly webUrl: string) {}

  get loopbackCallback(): string {
    return new URL(
      '/oauth-callback',
      this.webUrl.replace('localhost', '127.0.0.1'),
    ).href;
  }

  static audienceOf(accessToken: string): string[] {
    const [, payload] = accessToken.split('.');
    const { aud } = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    ) as { aud: string | string[] };
    return [aud].flat();
  }

  authorizeUrl(request: AuthorizationRequest): string {
    const authorize = new URL('/api/auth/oauth2/authorize', this.webUrl);
    authorize.search = new URLSearchParams({
      response_type: 'code',
      client_id: request.clientId,
      redirect_uri: request.redirectUri,
      scope: request.scope,
      state: request.state,
      resource: request.resource,
      code_challenge: request.pkce.challenge,
      code_challenge_method: 'S256',
    }).toString();
    return authorize.href;
  }

  async exchange(
    exchange: CodeExchange,
  ): Promise<{ status: number; accessToken: string }> {
    const response = await fetch(`${this.webUrl}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: exchange.code,
        redirect_uri: exchange.redirectUri,
        client_id: exchange.clientId,
        code_verifier: exchange.pkce.verifier,
        resource: exchange.resource,
      }),
    });
    const body = (await response.json()) as { access_token?: string };
    return { status: response.status, accessToken: body.access_token ?? '' };
  }

  async userinfo(accessToken: string): Promise<unknown> {
    const response = await fetch(`${this.webUrl}/api/auth/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    return response.json();
  }
}
