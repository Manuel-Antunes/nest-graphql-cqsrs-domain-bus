import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { PolarPage } from './polar-page';

/**
 * **Polar's customer portal**, reached from the billing settings: the subscription's own page, and the
 * cancellation Polar asks a reason for before it schedules the end of the period.
 */
export class PolarPortal extends PolarPage {
  constructor(page: Page) {
    super(page);
  }

  plan(name: string): Locator {
    return this.page.getByText(name).first();
  }

  async cancelSubscription(): Promise<void> {
    await this.opened();
    await this.page
      .getByRole('button', { name: 'Manage subscription' })
      .first()
      .click({ timeout: 60_000 });
    await this.page
      .getByRole('button', { name: /cancel subscription/i })
      .first()
      .click();

    const dialog = this.page
      .getByRole('dialog')
      .filter({ hasText: "We're sorry to see you go" });
    await dialog.getByText('Not using it enough').click();
    await dialog.getByRole('button', { name: 'Cancel Subscription' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  }

  async backToMerchant(): Promise<void> {
    await this.page.getByRole('link', { name: /^Back to / }).click();
  }
}
