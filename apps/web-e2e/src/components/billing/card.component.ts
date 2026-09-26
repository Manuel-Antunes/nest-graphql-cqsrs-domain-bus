import type { Locator, Page } from '@playwright/test';

export abstract class CardComponent {
  protected constructor(readonly root: Locator) {}

  protected static titled(page: Page, title: string | RegExp): Locator {
    return page.locator('[data-slot="card"]').filter({
      has: page.locator('[data-slot="card-title"]', { hasText: title }),
    });
  }
}
