import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { AttachmentFile } from '../../model/post';
import { AuthView } from '../auth-view';

export interface Newcomer {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly avatar?: AttachmentFile;
}

export class SignUpPage extends AuthView {
  constructor(page: Page) {
    super(page, '/auth/sign-up');
  }

  get verificationNotice(): Locator {
    return this.page.getByText('Check your email for a verification link');
  }

  avatarPreview(avatar: AttachmentFile): Locator {
    return this.page.getByRole('img', { name: avatar.name });
  }

  async submit({ name, email, password, avatar }: Newcomer): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Name' }).fill(name);
    if (avatar) {
      await this.page.getByLabel('Avatar').setInputFiles(avatar);
      await expect(this.avatarPreview(avatar)).toBeVisible();
    }
    await this.page.getByRole('textbox', { name: 'Email' }).fill(email);
    await this.page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(password);
    await this.page.getByRole('button', { name: 'Sign Up' }).click();
  }
}
