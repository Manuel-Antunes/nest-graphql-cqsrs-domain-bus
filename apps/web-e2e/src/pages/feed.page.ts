import type { Locator, Page } from '@playwright/test';

import { WebPage } from './web-page';

export class FeedPage extends WebPage {
  constructor(page: Page) {
    super(page, '/feed');
  }

  entry(title: string): Locator {
    return this.page.locator('main').getByText(title);
  }

  mentions(text: string): Locator {
    return this.page.getByText(text).first();
  }
}
