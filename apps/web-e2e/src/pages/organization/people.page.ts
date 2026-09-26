import type { Page } from '@playwright/test';

import { AuthView } from '../auth-view';

export class PeoplePage extends AuthView {
  constructor(page: Page) {
    super(page, '/organization/people');
  }

  async invite(email: string): Promise<void> {
    await this.page
      .getByRole('button', { name: 'Invite member' })
      .first()
      .click();
    const dialog = this.page.getByRole('dialog', { name: 'Invite member' });
    await dialog.getByRole('textbox', { name: 'Email' }).fill(email);
    await dialog.getByRole('button', { name: 'Invite member' }).click();
  }
}
