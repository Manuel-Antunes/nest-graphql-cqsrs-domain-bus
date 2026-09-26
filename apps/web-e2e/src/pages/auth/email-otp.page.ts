import type { Page } from '@playwright/test';

import { AuthView } from '../auth-view';

export class EmailOtpPage extends AuthView {
  constructor(page: Page) {
    super(page, '/auth/email-otp');
  }

  async sendCode(email: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Email' }).fill(email);
    await this.page.getByRole('button', { name: 'Send code' }).click();
  }

  async enter(code: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Code' }).fill(code);
  }
}
