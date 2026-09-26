import type { Locator, Page } from '@playwright/test';

import { AuthView } from '../auth-view';

export interface Newcomer {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export class SignUpPage extends AuthView {
  constructor(page: Page) {
    super(page, '/auth/sign-up');
  }

  get verificationNotice(): Locator {
    return this.page.getByText('Check your email for a verification link');
  }

  async submit({ name, email, password }: Newcomer): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Name' }).fill(name);
    await this.page.getByRole('textbox', { name: 'Email' }).fill(email);
    await this.page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(password);
    await this.page.getByRole('button', { name: 'Sign Up' }).click();
  }
}
