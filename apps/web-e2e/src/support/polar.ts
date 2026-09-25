import { Polar } from '@polar-sh/sdk';
import { PresentmentCurrency } from '@polar-sh/sdk/models/components/presentmentcurrency.js';
import type { WebhookEventType } from '@polar-sh/sdk/models/components/webhookeventtype.js';

import { TestEnvironment } from './test-environment';

export interface E2eProduct {
  id: string;
  name: string;
  amount: number;
  currency: string;
}

export interface E2eProducts {
  free: E2eProduct;
  pro: E2eProduct;
}

export interface Delivery {
  eventId: string;
  type: string;
  succeeded: boolean;
  httpCode: number | null;
}

const E2E_METADATA_KEY = 'nestposts_e2e';
const WEBHOOK_NAME = 'nestposts e2e';
const PAGE_SIZE = 100;
const ABANDONED_AFTER_MS = 2 * 60 * 60_000;
const PRO_PRICE = 1000;

export const WEBHOOK_EVENTS: WebhookEventType[] = [
  'checkout.created',
  'checkout.updated',
  'order.created',
  'order.paid',
  'subscription.created',
  'subscription.active',
  'subscription.updated',
  'subscription.canceled',
  'subscription.uncanceled',
  'subscription.revoked',
  'customer.created',
  'customer.updated',
  'customer.state_changed',
];

/**
 * **Polar's sandbox, as the billing suite drives it** — never anything else.
 *
 * The token is `TestEnvironment`'s `POLAR_ACCESS_TOKEN`, never the root `.env`'s. The client is pinned
 * to `sandbox-api`, so a production token fails to authenticate instead of charging anybody, and a
 * `POLAR_ENVIRONMENT` other than `sandbox` is refused outright. `E2E_BILLING=off` turns the suite's
 * billing off with a token present.
 */
export class PolarSandbox {
  readonly client: Polar;

  private constructor(readonly accessToken: string) {
    this.client = new Polar({ accessToken, server: 'sandbox' });
  }

  static fromEnvironment(): PolarSandbox | null {
    if (process.env.E2E_BILLING === 'off') {
      return null;
    }
    const environment = TestEnvironment.read('POLAR_ENVIRONMENT');
    if (environment && environment !== 'sandbox') {
      throw new Error(
        `POLAR_ENVIRONMENT=${environment}: the billing suite only runs against Polar's sandbox`,
      );
    }
    const token = TestEnvironment.read('POLAR_ACCESS_TOKEN');
    return token ? new PolarSandbox(token) : null;
  }

  async ensureProducts(): Promise<E2eProducts> {
    const existing = await this.products();
    const {
      result: {
        items: [organization],
      },
    } = await this.client.organizations.list({ limit: 1 });
    const currency = PolarSandbox.presentment(
      organization.defaultPresentmentCurrency,
    );

    const ensure = async (
      key: keyof E2eProducts,
      name: string,
      amount: number,
    ): Promise<E2eProduct> => {
      const found = existing.find(
        (product) =>
          product.metadata[E2E_METADATA_KEY] === key &&
          product.prices.some((price) => price.priceCurrency === currency),
      );
      const product =
        found ??
        (await this.client.products.create({
          name,
          recurringInterval: 'month',
          prices: [
            amount === 0
              ? { amountType: 'free', priceCurrency: currency }
              : {
                  amountType: 'fixed',
                  priceAmount: amount,
                  priceCurrency: currency,
                },
          ],
          metadata: { [E2E_METADATA_KEY]: key },
        }));
      return { id: product.id, name: product.name, amount, currency };
    };

    return {
      free: await ensure('free', 'nestposts e2e Free', 0),
      pro: await ensure('pro', 'nestposts e2e Pro', PRO_PRICE),
    };
  }

  async registerWebhook(url: string): Promise<{ id: string; secret: string }> {
    await this.forgetDeadWebhooks(url);
    const endpoint = await this.client.webhooks.createWebhookEndpoint({
      url,
      name: WEBHOOK_NAME,
      format: 'raw',
      events: WEBHOOK_EVENTS,
    });
    return { id: endpoint.id, secret: endpoint.secret };
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.client.webhooks.deleteWebhookEndpoint({ id });
  }

  async deliveries(
    endpointId: string,
    customerId: string,
  ): Promise<Delivery[]> {
    const deliveries: Delivery[] = [];
    const pages = await this.client.webhooks.listWebhookDeliveries({
      endpointId,
      limit: PAGE_SIZE,
    });
    for await (const page of pages) {
      for (const delivery of page.result.items) {
        const payload = JSON.parse(delivery.webhookEvent.payload ?? '{}') as {
          data?: { customer?: { external_id?: string }; external_id?: string };
        };
        const owner =
          payload.data?.customer?.external_id ?? payload.data?.external_id;
        if (owner === customerId) {
          deliveries.push({
            eventId: delivery.webhookEvent.id,
            type: delivery.webhookEvent.type,
            succeeded: delivery.succeeded,
            httpCode: delivery.httpCode,
          });
        }
      }
    }
    return deliveries;
  }

  async activeSubscriptionOf(customerId: string) {
    const state = await this.client.customers.getStateExternal({
      externalId: customerId,
    });
    return state.activeSubscriptions[0] ?? null;
  }

  async revoke(subscriptionId: string): Promise<void> {
    await this.client.subscriptions.revoke({ id: subscriptionId });
  }

  async redeliver(eventId: string): Promise<void> {
    await this.client.webhooks.redeliverWebhookEvent({ id: eventId });
  }

  private static presentment(currency: string): PresentmentCurrency {
    const known = Object.values<string>(PresentmentCurrency);
    if (!known.includes(currency)) {
      throw new Error(`Polar cannot price in ${currency}`);
    }
    return currency as PresentmentCurrency;
  }

  private async products() {
    const products = [];
    const pages = await this.client.products.list({
      isArchived: false,
      limit: PAGE_SIZE,
    });
    for await (const page of pages) {
      products.push(...page.result.items);
    }
    return products;
  }

  private async forgetDeadWebhooks(url: string): Promise<void> {
    const dead: string[] = [];
    const pages = await this.client.webhooks.listWebhookEndpoints({
      limit: PAGE_SIZE,
    });
    for await (const page of pages) {
      for (const endpoint of page.result.items) {
        const abandoned =
          Date.now() - endpoint.createdAt.getTime() > ABANDONED_AFTER_MS;
        if (
          endpoint.name === WEBHOOK_NAME &&
          (endpoint.url === url || abandoned)
        ) {
          dead.push(endpoint.id);
        }
      }
    }
    for (const id of dead) {
      await this.deleteWebhook(id);
    }
  }
}
