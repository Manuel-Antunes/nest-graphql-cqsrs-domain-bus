import type { Locator, Page } from '@playwright/test';

import { NotificationItem } from './notification-item.component';

export class NotificationBell {
  constructor(private readonly page: Page) {}

  get unread(): Locator {
    return this.page.getByRole('button', {
      name: /^Notifications, \d+ unread$/,
    });
  }

  get allRead(): Locator {
    return this.page.getByRole('button', {
      name: 'Notifications',
      exact: true,
    });
  }

  async open(): Promise<void> {
    await this.page.getByRole('button', { name: /^Notifications/ }).click();
  }

  item(text: string): NotificationItem {
    return new NotificationItem(
      this.page
        .getByRole('list', { name: 'Notifications' })
        .getByRole('listitem')
        .filter({ hasText: text }),
    );
  }
}
