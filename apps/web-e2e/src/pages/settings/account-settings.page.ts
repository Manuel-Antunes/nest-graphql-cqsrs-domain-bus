import type { Locator, Page } from '@playwright/test';

import type { AttachmentFile } from '../../model/post';
import { AuthView } from '../auth-view';

export class AccountSettingsPage extends AuthView {
  constructor(page: Page) {
    super(page, '/settings/account');
  }

  get changeRequested(): Locator {
    return this.page.getByText('Check your email to confirm the change');
  }

  get avatarChanged(): Locator {
    return this.page.getByText('Avatar changed successfully');
  }

  get avatarDeleted(): Locator {
    return this.page.getByText('Avatar deleted successfully');
  }

  async changeEmail(email: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Email' }).fill(email);
    await this.page.getByRole('button', { name: 'Update email' }).click();
  }

  async changeAvatar(avatar: AttachmentFile): Promise<void> {
    await this.page
      .locator('input[type="file"][accept="image/*"]')
      .setInputFiles(avatar);
  }

  async deleteAvatar(): Promise<void> {
    await this.page.getByRole('button', { name: 'Change avatar' }).click();
    await this.page.getByRole('menuitem', { name: 'Delete avatar' }).click();
  }
}
