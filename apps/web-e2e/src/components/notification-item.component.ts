import type { Locator } from '@playwright/test';

export class NotificationItem {
  constructor(readonly row: Locator) {}

  link(name: string): Locator {
    return this.row.getByRole('link', { name });
  }

  async delete(): Promise<void> {
    await this.row
      .getByRole('button', { name: /^Delete notification/ })
      .click();
  }
}
