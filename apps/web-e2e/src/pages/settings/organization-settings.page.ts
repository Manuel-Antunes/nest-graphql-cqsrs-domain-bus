import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { AuthView } from '../auth-view';

export class OrganizationSettingsPage extends AuthView {
  constructor(page: Page) {
    super(page, '/settings/organizations');
  }

  async create(name: string): Promise<void> {
    await this.page
      .getByRole('button', { name: 'Create organization' })
      .first()
      .click();
    const dialog = this.page.getByRole('dialog', {
      name: 'Create organization',
    });
    await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
    await dialog.getByRole('button', { name: 'Create organization' }).click();
    await expect(this.page.getByText(name).first()).toBeVisible();
  }

  async manage(): Promise<void> {
    await this.page.getByRole('button', { name: 'Manage' }).click();
    await expect(this.page).toHaveURL(/\/organization\/settings/);
  }
}
