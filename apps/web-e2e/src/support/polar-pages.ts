import type { Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';

export const TEST_CARD = {
  number: '4242424242424242',
  expiry: '1234',
  cvc: '123',
};

const BILLING_COUNTRY = 'DE';
const SAVE_TIMEOUT_MS = 10_000;
const RETURN_TIMEOUT_MS = 90_000;

const isPolar = (url: URL) => url.hostname.endsWith('polar.sh');

/**
 * **Polar's hosted checkout, filled the way a buyer does.**
 *
 * The form saves each field to the checkout as it is left — a `PATCH` to `/v1/checkouts/client/…` —
 * and submitting reads what was SAVED, not what is on screen: a field typed and submitted without
 * leaving it first is a click that only saves it. So every field is left and its save awaited, and
 * the first one is retried until the page has hydrated enough to save at all.
 *
 * The email must be deliverable: Polar refuses `example.com`, so a buyer's account is on a domain
 * that exists — which changes nothing here, where every email lands in Mailpit anyway.
 */
export class PolarCheckout {
  constructor(
    private readonly page: Page,
    private readonly returnsTo: string,
  ) {}

  async subscribeForFree(email: string): Promise<void> {
    await this.opened();
    await this.enterEmail(email);
    await this.page.getByRole('button', { name: 'Get for free' }).click();
    await this.returned();
  }

  async subscribeWithCard(email: string, name: string): Promise<void> {
    await this.opened();
    await this.enterEmail(email);

    const card = this.page
      .frameLocator(
        'iframe[title="Secure payment input frame"], iframe[name^="__privateStripeFrame"][title*="payment" i]',
      )
      .first();
    await card.locator('input[name="number"]').fill(TEST_CARD.number);
    await card.locator('input[name="expiry"]').fill(TEST_CARD.expiry);
    await card.locator('input[name="cvc"]').fill(TEST_CARD.cvc);

    await this.page.locator('input[name="customer_name"]').fill(name);
    await this.saving(() => this.page.keyboard.press('Tab'));
    await this.saving(() =>
      this.page.locator('select').first().selectOption(BILLING_COUNTRY),
    );

    await this.page.getByRole('button', { name: 'Subscribe now' }).click();
    await this.returned();
  }

  private async opened(): Promise<void> {
    await this.page.waitForURL(isPolar);
  }

  private async enterEmail(email: string): Promise<void> {
    const field = this.page.locator('input[name="customer_email"]');
    await expect(async () => {
      await field.clear();
      await field.fill(email);
      await this.saving(() => this.page.keyboard.press('Tab'));
    }).toPass({ timeout: 45_000 });
  }

  private async saving(action: () => Promise<unknown>): Promise<Response> {
    const saved = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().includes('/v1/checkouts/client/'),
      { timeout: SAVE_TIMEOUT_MS },
    );
    await action();
    return saved;
  }

  private async returned(): Promise<void> {
    await this.page.waitForURL((url) => url.href.startsWith(this.returnsTo), {
      timeout: RETURN_TIMEOUT_MS,
    });
  }
}

/**
 * **Polar's customer portal**, reached from the billing settings: the subscription's own page, and the
 * cancellation Polar asks a reason for before it schedules the end of the period.
 */
export class PolarPortal {
  constructor(private readonly page: Page) {}

  async cancelSubscription(): Promise<void> {
    await this.page.waitForURL(isPolar);
    const manage = this.page
      .getByRole('button', { name: 'Manage subscription' })
      .first();
    await manage.click({ timeout: 60_000 });
    await this.page
      .getByRole('button', { name: /cancel subscription/i })
      .first()
      .click();

    const dialog = this.page
      .getByRole('dialog')
      .filter({ hasText: "We're sorry to see you go" });
    await dialog.getByText('Not using it enough').click();
    await dialog.getByRole('button', { name: 'Cancel Subscription' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  }
}
