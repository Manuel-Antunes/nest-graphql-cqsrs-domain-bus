import type { Locator, Page } from '@playwright/test';

import { CardComponent } from './card.component';

export class SubscriptionCard extends CardComponent {
  constructor(page: Page) {
    super(CardComponent.titled(page, /^Subscription$/));
  }

  get none(): Locator {
    return this.root.getByText('No active subscription');
  }

  get active(): Locator {
    return this.root.getByText('active', { exact: true });
  }

  get cancelButton(): Locator {
    return this.root.getByRole('button', { name: 'Cancel subscription' });
  }

  plan(name: string): Locator {
    return this.root.getByText(name);
  }

  period(period: RegExp): Locator {
    return this.root.getByText(period);
  }

  async manageBilling(): Promise<void> {
    await this.root.getByRole('button', { name: 'Manage billing' }).click();
  }
}
