import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { AuthView } from '../auth-view';

export class ResetPasswordPage extends AuthView {
  constructor(page: Page) {
    super(page, '/auth/reset-password');
  }

  async choose(password: string): Promise<void> {
    await expect(this.page).toHaveURL(/\/auth\/reset-password\?token=/);
    await this.page.getByRole('textbox', { name: 'Password' }).fill(password);
    await this.page.getByRole('button', { name: 'Reset Password' }).click();
    await expect(this.page).toHaveURL(/\/auth\/sign-in/);
  }
}
