import type { Account } from '../../model/account';
import type { E2eProduct } from '../../model/product';
import type { PolarPortal } from '../../pages/polar/polar-portal.page';
import { BillingSettingsPage } from '../../pages/settings/billing-settings.page';
import type { WebApp } from '../../pages/web-app';

export class Subscriptions {
  constructor(
    private readonly app: WebApp,
    private readonly webUrl: string,
  ) {}

  get billingUrl(): string {
    return `${this.webUrl}${BillingSettingsPage.PATH}`;
  }

  async subscribeForFree(plan: E2eProduct, email: string): Promise<void> {
    await this.choose(plan);
    await this.app.polarCheckout(this.billingUrl).subscribeForFree(email);
  }

  async subscribeWithCard(
    plan: E2eProduct,
    buyer: Pick<Account, 'email' | 'name'>,
  ): Promise<void> {
    await this.choose(plan);
    await this.app
      .polarCheckout(this.billingUrl)
      .subscribeWithCard(buyer.email, buyer.name);
  }

  async openPortal(): Promise<PolarPortal> {
    await this.app.billingSettings.open();
    await this.app.billingSettings.subscription.manageBilling();
    await this.app.polarPortal.opened();
    return this.app.polarPortal;
  }

  async cancelInThePortal(): Promise<void> {
    await (await this.openPortal()).cancelSubscription();
  }

  async returnFromThePortal(): Promise<void> {
    await this.app.polarPortal.backToMerchant();
    await this.app.page.waitForURL(this.billingUrl);
  }

  private async choose(plan: E2eProduct): Promise<void> {
    await this.app.billingSettings.open();
    await this.app.billingSettings.plan(plan.name).choose();
  }
}
