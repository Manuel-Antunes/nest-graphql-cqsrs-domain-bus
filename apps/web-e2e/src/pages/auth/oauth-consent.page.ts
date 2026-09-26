import type { Locator, Page } from '@playwright/test';

import { AuthView } from '../auth-view';

export class OAuthConsentPage extends AuthView {
  constructor(page: Page) {
    super(page, '/auth/oauth-consent');
  }

  requestBy(client: string): Locator {
    return this.page.getByText(`Authorize ${client}`);
  }

  scope(description: string): Locator {
    return this.page.getByText(description);
  }

  async allow(): Promise<void> {
    await this.page.getByRole('button', { name: 'Allow' }).click();
  }
}
