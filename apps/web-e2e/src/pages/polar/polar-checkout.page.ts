import type { Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';

import { PolarPage } from './polar-page';

/**
 * **Polar's hosted checkout, filled the way a buyer does.**
 *
 * The form saves each field to the checkout as it is left — a `PATCH` to `/v1/checkouts/client/…` —
 * and submitting reads what was SAVED, not what is on screen: a field typed and submitted without
 * leaving it first is a click that only saves it. So every field is left and its save awaited, and
 * the first one is retried until the page has hydrated enough to save at all.
 *
 * The email must be deliverable: Polar refuses `example.com`, so a buyer's account is on a domain
 * that exists — which changes nothing here, where every email lands in Mailpit anyway. A buyer Polar
 * already has as a customer — made when they opened the billing screen — finds the field locked to
 * their own address, and there is nothing to type.
 */
export class PolarCheckout extends PolarPage {
  static readonly TEST_CARD = {
    number: '4242424242424242',
    expiry: '1234',
    cvc: '123',
  };

  private static readonly BILLING_COUNTRY = 'DE';
  private static readonly SAVE_TIMEOUT_MS = 10_000;
  private static readonly RETURN_TIMEOUT_MS = 90_000;

  constructor(
    page: Page,
    private readonly returnsTo: string,
  ) {
    super(page);
  }

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
    await card
      .locator('input[name="number"]')
      .fill(PolarCheckout.TEST_CARD.number);
    await card
      .locator('input[name="expiry"]')
      .fill(PolarCheckout.TEST_CARD.expiry);
    await card.locator('input[name="cvc"]').fill(PolarCheckout.TEST_CARD.cvc);

    await this.page.locator('input[name="customer_name"]').fill(name);
    await this.saving(() => this.page.keyboard.press('Tab'));
    await this.saving(() =>
      this.page
        .locator('select')
        .first()
        .selectOption(PolarCheckout.BILLING_COUNTRY),
    );

    await this.page.getByRole('button', { name: 'Subscribe now' }).click();
    await this.returned();
  }

  private async enterEmail(email: string): Promise<void> {
    const field = this.page.locator('input[name="customer_email"]');
    await expect(async () => {
      if (await field.isDisabled()) {
        await expect(field).toHaveValue(email);
        return;
      }
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
      { timeout: PolarCheckout.SAVE_TIMEOUT_MS },
    );
    await action();
    return saved;
  }

  private async returned(): Promise<void> {
    await this.page.waitForURL((url) => url.href.startsWith(this.returnsTo), {
      timeout: PolarCheckout.RETURN_TIMEOUT_MS,
    });
  }
}
