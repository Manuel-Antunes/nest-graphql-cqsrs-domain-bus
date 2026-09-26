import type { Locator, Page } from '@playwright/test';

import { AuthView } from '../auth-view';

export class AccountSettingsPage extends AuthView {
  constructor(page: Page) {
    super(page, '/settings/account');
  }

  get changeRequested(): Locator {
    return this.page.getByText('Check your email to confirm the change');
  }

  async changeEmail(email: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Email' }).fill(email);
    await this.page.getByRole('button', { name: 'Update email' }).click();
  }
}
