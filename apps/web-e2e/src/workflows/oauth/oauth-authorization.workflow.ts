import { expect } from '@playwright/test';

import type {
  AuthorizationRequest,
  OAuthProvider,
} from '../../infrastructure/auth/oauth-provider';
import type {
  OAuthClientRegistration,
  SignedInAuthApi,
} from '../../infrastructure/auth/signed-in-auth-api';
import type { OAuthConsentPage } from '../../pages/auth/oauth-consent.page';
import type { WebApp } from '../../pages/web-app';

export class OAuthAuthorization {
  constructor(
    private readonly app: WebApp,
    private readonly api: SignedInAuthApi,
    private readonly provider: OAuthProvider,
  ) {}

  registerClient(client: OAuthClientRegistration): Promise<string> {
    return this.api.registerOAuthClient(client);
  }

  async requestConsent(
    request: AuthorizationRequest,
  ): Promise<OAuthConsentPage> {
    await this.app.visit(this.provider.authorizeUrl(request));
    await expect(this.app.page).toHaveURL(/\/auth\/oauth-consent/);
    return this.app.oauthConsent;
  }

  async allow(redirectUri: string): Promise<URL> {
    await this.app.oauthConsent.allow();
    await this.app.page.waitForURL((url) => url.href.startsWith(redirectUri));
    return new URL(this.app.page.url());
  }
}
