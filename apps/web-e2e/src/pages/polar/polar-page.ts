import type { Page } from '@playwright/test';

export abstract class PolarPage {
  protected constructor(protected readonly page: Page) {}

  async opened(): Promise<void> {
    await this.page.waitForURL((url) => url.hostname.endsWith('polar.sh'));
  }
}
