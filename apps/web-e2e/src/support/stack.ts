import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { BillingStack } from './billing-stack';
import type { Endpoints } from './containers';
import { ContainerStack, FreePort } from './containers';
import { ServiceDatabase } from './database';
import { WORKSPACE_ROOT } from './docker';
import { HttpHealth, nextApplication, Service } from './service';
import { e2eTransport } from './transport';

export const ROOT_TENANT = 'root';

export const WEB_PORT = Number(process.env.WEB_PORT ?? 4300);

export const WEB_URL = process.env.WEB_URL ?? `http://localhost:${WEB_PORT}`;

/** The federation gateway, as the host reaches it — published by the global setup. */
export const gatewayUrl = (): string =>
  process.env.GATEWAY_URL ?? 'http://localhost:4000/graphql';

export const AUTH_SECRET =
  process.env.AUTH_SECRET ?? 'nestposts-web-e2e-secret';

/**
 * **The whole system, provisioned once**: a browser's worth of it.
 *
 * Everything the browser does not run is a **container**, from the images `apps/<app>/Dockerfile` build —
 * Postgres, RabbitMQ, Mailpit, the migrator as a one-shot, and then `posts-api`, `tagging`,
 * `notificator` and the `gateway` that federates the first and the last. They share a
 * network and address each other by alias, so the suite never has to teach one of them a port.
 *
 * `apps/web` is the exception, and deliberately: it is the thing under the browser, it is served by
 * `next start` the way `nx` serves it everywhere else, and keeping it a process is what keeps a
 * failure one `tail` away instead of one `docker build` away.
 *
 * The web PUBLISHES on the run's transport as well — the emails its Better Auth asks for are
 * notifications, and they reach the notificator's container the way every other event does — so it
 * is handed the broker, or the dev server, at the address the host sees it on.
 *
 * Billing is Polar's SANDBOX, when the suite has a token for it (see `BillingStack`): a tunnel to the
 * web's port and a webhook registered at it, opened before the web because the web is started with
 * the webhook's secret. Without a token the web runs with billing off, as it does for anyone who has
 * not configured Polar.
 *
 * `AUTH_SECRET` is one value for all of them, and that is the point rather than a convenience:
 * `apps/web` holds its own Better Auth and signs the session cookie itself, and `apps/posts-api`
 * resolves that same cookie against the same row. A different secret per process and the browser
 * would log in and be refused one hop later.
 */
export class Stack {
  readonly logDirectory =
    process.env.E2E_LOGS ?? join(WORKSPACE_ROOT, 'apps/web-e2e/target/logs');

  readonly postsStore = ServiceDatabase.ofTenant(ROOT_TENANT);
  readonly taggingStore = ServiceDatabase.ofTenant(ROOT_TENANT);

  private readonly containers = new ContainerStack();
  private web?: Service;
  private billing?: BillingStack;

  async up(): Promise<void> {
    mkdirSync(this.logDirectory, { recursive: true });
    const logs = (line: string) =>
      appendFileSync(join(this.logDirectory, 'containers.log'), line);
    const endpoints = await this.containers.up({
      transport: e2eTransport(),
      apiPort: await FreePort.pick(),
      gatewayPort: await FreePort.pick(),
      storagePort: await FreePort.pick(),
      webUrl: WEB_URL,
      authSecret: AUTH_SECRET,
      logs,
    });

    this.publish(endpoints);

    try {
      this.billing = (await BillingStack.up(WEB_PORT, logs)) ?? undefined;
      this.billing?.publish();
      await this.startWeb(endpoints);
      await this.billing?.verify();
    } catch (failure) {
      await this.down();
      throw failure;
    }
  }

  async down(): Promise<void> {
    this.web?.stop();
    this.web = undefined;
    await this.billing?.down();
    this.billing = undefined;
    await this.containers.down();
  }

  /**
   * Where the stack ended up, as environment.
   *
   * It is the only channel there is: a Playwright worker is a process of its own, forked **after**
   * this runs, and what it inherits is exactly this. `PostsApi`, `Broker` and `ServiceDatabase` all
   * read these names, which is what lets a fixture hand a spec a client to a container it never saw.
   */
  private publish(endpoints: Endpoints): void {
    process.env.POSTGRES_URL = endpoints.postgresUrl;
    process.env.API_URL = endpoints.apiUrl;
    process.env.GATEWAY_URL = endpoints.gatewayUrl;
    process.env.E2E_STORAGE_URL = endpoints.storageUrl;
    process.env.E2E_MAILBOX_URL = endpoints.mailboxUrl;
    if (endpoints.managementUrl) {
      process.env.RABBITMQ_MANAGEMENT = endpoints.managementUrl;
    }
    if (endpoints.inngestUrl) {
      process.env.INNGEST_BASE_URL = endpoints.inngestUrl;
    }
  }

  private async startWeb(endpoints: Endpoints): Promise<void> {
    this.web = new Service(
      'web',
      nextApplication('web', WEB_PORT),
      new HttpHealth(() => this.isWebUp(), WEB_URL),
      {
        POSTGRES_URL: endpoints.postgresUrl,
        AUTH_SECRET,
        WEB_URL,
        NEXT_PUBLIC_API_URL: endpoints.apiUrl,
        NEXT_PUBLIC_GATEWAY_URL: endpoints.gatewayUrl,
        POSTS_SUBGRAPH_URL: `${endpoints.apiUrl}/graphql`,
        GATEWAY_URL: endpoints.gatewayUrl,
        PORT: String(WEB_PORT),
        MIKRO_ORM_DEBUG: 'false',
        AUTH_RATE_LIMIT: 'false',
        POLAR_ACCESS_TOKEN: '',
        ...this.billing?.webEnvironment(),
        WEB_TRANSPORT: e2eTransport(),
        INNGEST_DEV: 'true',
        ...(endpoints.inngestUrl
          ? { INNGEST_BASE_URL: endpoints.inngestUrl }
          : {}),
        ...(endpoints.brokerUrl ? { RABBITMQ_URL: endpoints.brokerUrl } : {}),
      },
      this.logDirectory,
    );
    this.web.start();
    await this.web.waitUntilReady();
  }

  private async isWebUp(): Promise<boolean> {
    try {
      return (
        (await fetch(`${WEB_URL}/login`, { redirect: 'manual' })).status < 500
      );
    } catch {
      return false;
    }
  }
}
