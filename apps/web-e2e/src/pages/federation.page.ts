import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { WebPage } from './web-page';

export class FederationPage extends WebPage {
  constructor(page: Page) {
    super(page, '/federation');
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Federação' });
  }

  get withoutSession(): Locator {
    return this.page.getByText('Sem sessão');
  }

  get received(): Locator {
    return this.page.getByLabel('Entidades recebidas');
  }

  async resolveRepresentations(): Promise<void> {
    await this.page
      .getByRole('button', { name: /Resolver \d+ representações/ })
      .click();
  }

  async answersByPosition(): Promise<string[]> {
    const positions = this.page
      .getByRole('list', { name: 'Entidades por posição' })
      .getByRole('listitem');
    await expect(positions.first()).toBeVisible();
    return positions.allInnerTexts();
  }
}
