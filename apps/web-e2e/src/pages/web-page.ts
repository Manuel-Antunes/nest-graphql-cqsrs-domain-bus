import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface Opening {
  readonly settle?: boolean;
}

export interface Reopening extends Opening {
  readonly timeout?: number;
}

export abstract class WebPage {
  protected constructor(
    protected readonly page: Page,
    readonly path: string,
  ) {}

  async open({ settle = false }: Opening = {}): Promise<void> {
    await this.page.goto(this.path);
    if (settle) {
      await this.settle();
    }
  }

  async settle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async reopenUntil(
    assertion: () => Promise<void>,
    { timeout = 60_000, settle = false }: Reopening = {},
  ): Promise<void> {
    await expect(async () => {
      await this.open({ settle });
      await assertion();
    }).toPass({ timeout });
  }
}
