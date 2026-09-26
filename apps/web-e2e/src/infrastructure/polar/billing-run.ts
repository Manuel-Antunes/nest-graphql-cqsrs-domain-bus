import type { Account } from '../../model/account';
import type { E2eProducts } from '../../model/product';
import type { Delivery } from './polar-sandbox';
import { PolarSandbox } from './polar-sandbox';

/** What a worker needs to know about the billing half of the stack — `null` when it is off. */
export class BillingRun {
  constructor(
    readonly polar: PolarSandbox,
    readonly webhookEndpoint: string,
    readonly products: E2eProducts,
  ) {}

  static current(): BillingRun | null {
    const polar = PolarSandbox.fromEnvironment();
    const webhookEndpoint = process.env.E2E_POLAR_WEBHOOK_ENDPOINT;
    const products = process.env.E2E_POLAR_PRODUCTS;
    return polar && webhookEndpoint && products
      ? new BillingRun(
          polar,
          webhookEndpoint,
          JSON.parse(products) as E2eProducts,
        )
      : null;
  }

  static required(billing: BillingRun | null): BillingRun {
    if (!billing) {
      throw new Error('this run has no Polar sandbox');
    }
    return billing;
  }

  static publish(
    polar: PolarSandbox,
    webhookEndpoint: string,
    products: E2eProducts,
  ): void {
    process.env.E2E_POLAR_ACCESS_TOKEN = polar.accessToken;
    process.env.E2E_POLAR_WEBHOOK_ENDPOINT = webhookEndpoint;
    process.env.E2E_POLAR_PRODUCTS = JSON.stringify(products);
  }

  deliveriesTo(account: Account): Promise<Delivery[]> {
    return this.polar.deliveries(this.webhookEndpoint, account.credentialId);
  }

  async deliveriesOf(account: Account, eventId: string): Promise<Delivery[]> {
    return (await this.deliveriesTo(account)).filter(
      (delivery) => delivery.eventId === eventId,
    );
  }
}
