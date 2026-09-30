import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface OAuthClientRegistration {
  readonly name: string;
  readonly redirectUri: string;
  readonly scope: string;
}

export class SignedInAuthApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly webUrl: string,
  ) {}

  async enableTwoFactor(password: string): Promise<{ totpURI: string }> {
    const response = await this.post('/api/auth/two-factor/enable', {
      password,
    });
    return (await response.json()) as { totpURI: string };
  }

  async verifyTotp(code: string): Promise<void> {
    await SignedInAuthApi.mustSucceed(
      await this.post('/api/auth/two-factor/verify-totp', { code }),
    );
  }

  async createOrganization(name: string, slug: string): Promise<void> {
    await SignedInAuthApi.mustSucceed(
      await this.post('/api/auth/organization/create', { name, slug }),
    );
  }

  async createTeam(name: string): Promise<string> {
    const response = await this.post('/api/auth/organization/create-team', {
      name,
    });
    await SignedInAuthApi.mustSucceed(response);
    return ((await response.json()) as { id: string }).id;
  }

  async registerOAuthClient(client: OAuthClientRegistration): Promise<string> {
    const response = await this.post('/api/auth/oauth2/create-client', {
      client_name: client.name,
      redirect_uris: [client.redirectUri],
      application_type: 'native',
      token_endpoint_auth_method: 'none',
      scope: client.scope,
    });
    const body = await response.text();
    if (response.status() !== 201) {
      throw new Error(
        `registering ${client.name} answered ${response.status()}: ${body}`,
      );
    }
    return (JSON.parse(body) as { client_id: string }).client_id;
  }

  private post(path: string, data: unknown): Promise<APIResponse> {
    return this.request.post(path, {
      headers: { origin: this.webUrl },
      data,
    });
  }

  private static async mustSucceed(response: APIResponse): Promise<void> {
    if (!response.ok()) {
      throw new Error(
        `${response.url()} answered ${response.status()}: ${await response.text()}`,
      );
    }
  }
}
