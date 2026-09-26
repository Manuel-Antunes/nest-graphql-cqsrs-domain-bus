import type { Locator, Page } from '@playwright/test';

import type { E2eProduct } from '../../model/product';
import { Price } from '../../model/product';
import { CardComponent } from './card.component';

export class PlanCard extends CardComponent {
  constructor(page: Page, name: string) {
    super(CardComponent.titled(page, name));
  }

  price(product: E2eProduct): Locator {
    return this.root.getByText(Price.monthlyOf(product));
  }

  get perMonth(): Locator {
    return this.root.getByText('per month');
  }

  get chooseButton(): Locator {
    return this.root.getByRole('button', { name: 'Choose plan' });
  }

  get currentPlanButton(): Locator {
    return this.root.getByRole('button', { name: 'Current plan' });
  }

  async choose(): Promise<void> {
    await this.chooseButton.click();
  }
}
