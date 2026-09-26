import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { PlanCard } from '../../components/billing/plan-card.component';
import { SubscriptionCard } from '../../components/billing/subscription-card.component';
import { WebPage } from '../web-page';

export class BillingSettingsPage extends WebPage {
  static readonly PATH = '/settings/billing';

  readonly subscription: SubscriptionCard;

  constructor(page: Page) {
    super(page, BillingSettingsPage.PATH);
    this.subscription = new SubscriptionCard(page);
  }

  plan(name: string): PlanCard {
    return new PlanCard(this.page, name);
  }

  async untilSubscriptionShows(plan: string, period: RegExp): Promise<void> {
    await this.reopenUntil(async () => {
      await expect(this.subscription.plan(plan)).toBeVisible({
        timeout: 5_000,
      });
      await expect(this.subscription.period(period)).toBeVisible({
        timeout: 5_000,
      });
    });
  }
}
