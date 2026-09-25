import type { E2eProducts } from './polar';
import { PolarSandbox } from './polar';
import { Tunnel } from './tunnel';

export const WEBHOOK_PATH = '/api/auth/polar/webhooks';

const UNSIGNED = 400;
const TUNNEL_DEADLINE_MS = 60_000;

/** What a worker needs to know about the billing half of the stack — `null` when it is off. */
export interface BillingRun {
  polar: PolarSandbox;
  webhookEndpoint: string;
  products: E2eProducts;
}

export const billingRun = (): BillingRun | null => {
  const polar = PolarSandbox.fromEnvironment();
  const webhookEndpoint = process.env.E2E_POLAR_WEBHOOK_ENDPOINT;
  const products = process.env.E2E_POLAR_PRODUCTS;
  return polar && webhookEndpoint && products
    ? { polar, webhookEndpoint, products: JSON.parse(products) as E2eProducts }
    : null;
};

/**
 * **Billing, against Polar's sandbox, with its webhooks delivered to this run's web.**
 *
 * Up before the web, because the web is started with the secret: the products the suite sells are
 * found or created, a tunnel is opened to the web's port, and a webhook endpoint is registered at the
 * tunnel's address — which is what makes Polar generate the secret the web then verifies with. Once
 * the web answers, an unsigned POST through the tunnel must come back `400`: that is the web itself
 * refusing a signature, which proves the tunnel, the route and the secret at once, and turns every way
 * of getting them wrong into one failure at setup instead of a webhook test timing out later.
 *
 * Down deletes the endpoint and closes the tunnel. An endpoint a run left behind is deleted by the
 * next one — see `PolarSandbox.registerWebhook`.
 */
export class BillingStack {
  private constructor(
    private readonly polar: PolarSandbox,
    private readonly tunnel: Tunnel,
    private readonly webhook: { id: string; secret: string },
    private readonly products: E2eProducts,
  ) {}

  static async up(
    webPort: number,
    logs: (line: string) => void,
  ): Promise<BillingStack | null> {
    const polar = PolarSandbox.fromEnvironment();
    if (!polar) {
      return null;
    }
    const products = await polar.ensureProducts();
    const tunnel = await Tunnel.open(webPort, logs);
    try {
      const webhook = await polar.registerWebhook(
        `${tunnel.url}${WEBHOOK_PATH}`,
      );
      logs(`billing: webhook ${webhook.id} at ${tunnel.url}${WEBHOOK_PATH}\n`);
      return new BillingStack(polar, tunnel, webhook, products);
    } catch (failure) {
      await tunnel.close();
      throw failure;
    }
  }

  webEnvironment(): Record<string, string> {
    return {
      POLAR_ACCESS_TOKEN: this.polar.accessToken,
      POLAR_ENVIRONMENT: 'sandbox',
      POLAR_WEBHOOK_SECRET: this.webhook.secret,
    };
  }

  publish(): void {
    process.env.E2E_POLAR_ACCESS_TOKEN = this.polar.accessToken;
    process.env.E2E_POLAR_WEBHOOK_ENDPOINT = this.webhook.id;
    process.env.E2E_POLAR_PRODUCTS = JSON.stringify(this.products);
  }

  async verify(): Promise<void> {
    const deadline = Date.now() + TUNNEL_DEADLINE_MS;
    let status = await this.tunnel.statusOf(WEBHOOK_PATH);
    while (status !== UNSIGNED && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      status = await this.tunnel.statusOf(WEBHOOK_PATH);
    }
    if (status !== UNSIGNED) {
      throw new Error(
        `an unsigned webhook through ${this.tunnel.url} answered ${status}, not ${UNSIGNED}: Polar could not reach the web`,
      );
    }
  }

  async down(): Promise<void> {
    await this.polar.deleteWebhook(this.webhook.id).catch(() => undefined);
    await this.tunnel.close();
  }
}
