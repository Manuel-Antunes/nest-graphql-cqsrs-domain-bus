import type { Locator, Page } from '@playwright/test';

export class AppHeader {
  constructor(private readonly page: Page) {}

  get accountButton(): Locator {
    return this.page.getByRole('button', { name: 'Account' });
  }

  get signInLink(): Locator {
    return this.page.getByRole('link', { name: 'Sign in' });
  }

  identity(email: string): Locator {
    return this.page.getByText(email).first();
  }

  role(name: string): Locator {
    return this.page.getByText(name, { exact: true });
  }

  async signOut(): Promise<void> {
    await this.accountButton.click();
    await this.page.getByRole('menuitem', { name: 'Sign Out' }).click();
    await this.page.waitForURL('**/auth/sign-in**');
  }

  async switchOrganization(active: string, next: string): Promise<void> {
    await this.page
      .locator('header')
      .getByRole('button', { name: active })
      .click();
    const switched = this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/auth/organization/set-active') &&
        response.ok(),
    );
    await this.page.getByRole('menuitem').filter({ hasText: next }).click();
    await switched;
  }
}
