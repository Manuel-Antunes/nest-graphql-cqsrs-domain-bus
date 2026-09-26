import type { Locator, Page } from '@playwright/test';

import { AuthView } from '../auth-view';

export class SecuritySettingsPage extends AuthView {
  constructor(page: Page) {
    super(page, '/settings/security');
  }

  get unknownBrowser(): Locator {
    return this.page.getByText('Unknown Browser').first();
  }

  get deleteAccountButton(): Locator {
    return this.page.getByRole('button', { name: 'Delete account' });
  }

  get deletionRequested(): Locator {
    return this.page.getByText('Check your email to confirm account deletion.');
  }

  async requestAccountDeletion(): Promise<void> {
    await this.deleteAccountButton.click();
    await this.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete account' })
      .click();
  }
}
