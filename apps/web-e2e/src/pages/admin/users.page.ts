import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { Account } from '../../model/account';
import { AuthView } from '../auth-view';

export class UsersPage extends AuthView {
  constructor(page: Page) {
    super(page, '/admin/users');
  }

  get accessDenied(): Locator {
    return this.page.getByRole('heading', { name: 'Access denied' });
  }

  async ban(
    { name, email }: Pick<Account, 'name' | 'email'>,
    reason: string,
  ): Promise<void> {
    await this.page.getByRole('button', { name }).first().click();
    const drawer = this.page.getByRole('dialog', { name });
    await expect(drawer.getByText(email)).toBeVisible();
    await drawer.getByRole('button', { name: 'Ban user' }).click();
    const ban = this.page.getByRole('alertdialog', { name: 'Ban user' });
    await ban.getByRole('textbox', { name: 'Ban reason' }).fill(reason);
    await ban.getByRole('button', { name: 'Ban user' }).click();
    await expect(ban).toHaveCount(0);
  }
}
