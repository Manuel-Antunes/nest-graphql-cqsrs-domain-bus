import type { Locator, Page } from '@playwright/test';

import { AuthView } from '../auth-view';

export class AcceptInvitationPage extends AuthView {
  constructor(page: Page) {
    super(page, '/auth/accept-invitation');
  }

  invitationTo(organization: string): Locator {
    return this.page.getByText(
      `You've been invited to join ${organization} as Member.`,
    );
  }

  async accept(): Promise<void> {
    await this.page.getByRole('button', { name: 'Accept' }).click();
  }
}
