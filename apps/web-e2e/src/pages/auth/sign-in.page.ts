import type { Locator, Page } from '@playwright/test';

import type { Credentials } from '../../model/account';
import { AuthView } from '../auth-view';

export class SignInPage extends AuthView {
  constructor(page: Page) {
    super(page, '/auth/sign-in');
  }

  get incorrectCredentials(): Locator {
    return this.page.getByText(
      'The sign-in details are incorrect. Please try again.',
    );
  }

  async submit({ email, password }: Credentials): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Email' }).fill(email);
    await this.page.getByRole('textbox', { name: 'Password' }).fill(password);
    await this.page.getByRole('button', { name: 'Sign In' }).click();
  }
}
