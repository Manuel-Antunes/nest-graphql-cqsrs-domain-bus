import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { AuthView } from '../auth-view';

export class MagicLinkPage extends AuthView {
  constructor(page: Page) {
    super(page, '/auth/magic-link');
  }

  async request(email: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Email' }).fill(email);
    await this.page.getByRole('button', { name: 'Send Magic Link' }).click();
    await expect(this.page).toHaveURL(/\/auth\/magic-link-sent/);
  }
}
