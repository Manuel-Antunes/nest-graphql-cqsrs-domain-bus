import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { AuthView } from '../auth-view';

export class ForgotPasswordPage extends AuthView {
  constructor(page: Page) {
    super(page, '/auth/forgot-password');
  }

  async requestReset(email: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Email' }).fill(email);
    await this.page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(this.page).toHaveURL(/\/auth\/reset-link-sent/);
  }
}
