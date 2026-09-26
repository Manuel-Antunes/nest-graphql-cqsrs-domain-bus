import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { AuthView } from '../auth-view';

export class TwoFactorPage extends AuthView {
  constructor(page: Page) {
    super(page, '/auth/two-factor');
  }

  async askForEmailedCode(): Promise<void> {
    await expect(this.page).toHaveURL(/\/auth\/two-factor/);
    await this.page
      .getByRole('button', { name: 'Use an emailed code' })
      .click();
    await this.page.getByRole('button', { name: 'Email me a code' }).click();
  }

  async enterEmailedCode(code: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Emailed code' }).fill(code);
  }
}
