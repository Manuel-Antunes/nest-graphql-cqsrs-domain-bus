import type { Locator, Page } from '@playwright/test';

import { WebPage } from './web-page';

export class MePage extends WebPage {
  constructor(page: Page) {
    super(page, '/me');
  }

  get failure(): Locator {
    return this.page.getByText('me falhou');
  }

  named(name: string): Locator {
    return this.page.getByText(name, { exact: true }).first();
  }
}
