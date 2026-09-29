import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Endpoints } from '../environment/run-environment';
import { RunEnvironment } from '../environment/run-environment';
import { Storage } from '../infrastructure/storage/storage';
import { BillingStack } from './billing-stack';
import { ContainerStack } from './container-stack';
import { FreePort } from './free-port';
import { HttpHealth, Launch, Service } from './service';

/**
 * **The whole system, provisioned once**: a browser's worth of it.
 *
 * Everything the browser does not run is a **container**, from the images `apps/<app>/Dockerfile` build —
 * Postgres, Redis, RabbitMQ, Mailpit, the migrator as a one-shot, and then `posts-api`, `tagging`,
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
  private readonly containers = new ContainerStack();
  private web?: Service;
  private billing?: BillingStack;

  constructor(readonly environment: RunEnvironment = new RunEnvironment()) {}

  async up(): Promise<void> {
    const { environment } = this;
    mkdirSync(environment.logDirectory, { recursive: true });
    const logs = (line: string) =>
      appendFileSync(join(environment.logDirectory, 'containers.log'), line);
    const endpoints = await this.containers.up({
      transport: environment.transport,
      postsSubscriptionSource: environment.postsSubscriptionSource,
      apiPort: await FreePort.pick(),
      gatewayPort: await FreePort.pick(),
      storagePort: await FreePort.pick(),
      webUrl: environment.webUrl,
      authSecret: environment.authSecret,
      logLevel: environment.logLevel,
      logs,
    });

    environment.publish(endpoints);

    try {
      this.billing =
        (await BillingStack.up(environment.webPort, logs)) ?? undefined;
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

  private async startWeb(endpoints: Endpoints): Promise<void> {
    const { environment } = this;
    this.web = new Service(
      'web',
      Launch.next('web', environment.webPort),
      new HttpHealth(() => this.isWebUp(), environment.webUrl),
      {
        POSTGRES_URL: endpoints.postgresUrl,
        REDIS_URL: endpoints.redisUrl,
        AUTH_SECRET: environment.authSecret,
        AUTH_URL: environment.webUrl,
        WEB_URL: environment.webUrl,
        NEXT_PUBLIC_API_URL: endpoints.apiUrl,
        NEXT_PUBLIC_GATEWAY_URL: endpoints.gatewayUrl,
        POSTS_SUBGRAPH_URL: `${endpoints.apiUrl}/graphql`,
        GATEWAY_URL: endpoints.gatewayUrl,
        PORT: String(environment.webPort),
        MIKRO_ORM_DEBUG: 'false',
        AUTH_RATE_LIMIT: 'false',
        DRIVE_BUCKET: Storage.BUCKET,
        DRIVE_AWS_REGION: Storage.REGION,
        DRIVE_AWS_ACCESS_KEY_ID: Storage.USER,
        DRIVE_AWS_SECRET_ACCESS_KEY: Storage.PASSWORD,
        DRIVE_S3_ENDPOINT: endpoints.storageUrl,
        DRIVE_S3_FORCE_PATH_STYLE: 'true',
        POLAR_ACCESS_TOKEN: '',
        ...this.billing?.webEnvironment(),
        WEB_TRANSPORT: environment.transport,
        INNGEST_DEV: 'true',
        ...(endpoints.inngestUrl
          ? { INNGEST_BASE_URL: endpoints.inngestUrl }
          : {}),
        ...(endpoints.brokerUrl ? { RABBITMQ_URL: endpoints.brokerUrl } : {}),
      },
      environment.logDirectory,
    );
    this.web.start();
    await this.web.waitUntilReady();
  }

  private async isWebUp(): Promise<boolean> {
    try {
      return (
        (
          await fetch(`${this.environment.webUrl}/login`, {
            redirect: 'manual',
          })
        ).status < 500
      );
    } catch {
      return false;
    }
  }
}
