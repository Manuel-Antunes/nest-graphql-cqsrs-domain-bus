import { BillingRun } from '../infrastructure/polar/billing-run';
import { BillingWebhooks } from '../infrastructure/polar/billing-webhooks';
import { PolarSandbox } from '../infrastructure/polar/polar-sandbox';
import type { E2eProducts } from '../model/product';
import { Poll } from '../support/poll';
import { Tunnel } from './tunnel';

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
  private static readonly UNSIGNED = 400;
  private static readonly TUNNEL_DEADLINE_MS = 60_000;

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
      const url = `${tunnel.url}${BillingWebhooks.PATH}`;
      const webhook = await polar.registerWebhook(url);
      logs(`billing: webhook ${webhook.id} at ${url}\n`);
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
    BillingRun.publish(this.polar, this.webhook.id, this.products);
  }

  async verify(): Promise<void> {
    const deadline = Date.now() + BillingStack.TUNNEL_DEADLINE_MS;
    let status = await this.tunnel.statusOf(BillingWebhooks.PATH);
    while (status !== BillingStack.UNSIGNED && Date.now() < deadline) {
      await Poll.pause(2_000);
      status = await this.tunnel.statusOf(BillingWebhooks.PATH);
    }
    if (status !== BillingStack.UNSIGNED) {
      throw new Error(
        `an unsigned webhook through ${this.tunnel.url} answered ${status}, not ${BillingStack.UNSIGNED}: Polar could not reach the web`,
      );
    }
  }

  async down(): Promise<void> {
    await this.polar.deleteWebhook(this.webhook.id).catch(() => undefined);
    await this.tunnel.close();
  }
}
