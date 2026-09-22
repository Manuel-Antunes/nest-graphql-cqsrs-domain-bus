import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { ContainerStack, FreePort, type Endpoints } from './containers';
import { ServiceDatabase } from './database';
import { WORKSPACE_ROOT } from './docker';
import { HttpHealth, Service, nextApplication } from './service';
import { e2eTransport } from './transport';

export const POSTS_SCHEMA = process.env.POSTS_SCHEMA ?? 'posts';
export const TAGGING_SCHEMA = process.env.TAGGING_SCHEMA ?? 'tagging';

export const WEB_PORT = Number(process.env.WEB_PORT ?? 4300);

export const WEB_URL = process.env.WEB_URL ?? `http://localhost:${WEB_PORT}`;

export const AUTH_SECRET = process.env.AUTH_SECRET ?? 'nestposts-web-e2e-secret';

/**
 * **The whole system, provisioned once**: a browser's worth of it.
 *
 * Everything the browser does not run is a **container**, from the images `apps/<app>/Dockerfile` build —
 * Postgres, RabbitMQ, the migrator as a one-shot, and then `posts-api` and `tagging`. They share a
 * network and address each other by alias, so the suite never has to teach one of them a port.
 *
 * `apps/web` is the exception, and deliberately: it is the thing under the browser, it is served by
 * `next start` the way `nx` serves it everywhere else, and keeping it a process is what keeps a
 * failure one `tail` away instead of one `docker build` away.
 *
 * `AUTH_SECRET` is one value for all of them, and that is the point rather than a convenience:
 * `apps/web` holds its own Better Auth and signs the session cookie itself, and `apps/posts-api`
 * resolves that same cookie against the same row. A different secret per process and the browser
 * would log in and be refused one hop later.
 */
export class Stack {
  readonly logDirectory = process.env.E2E_LOGS ?? join(WORKSPACE_ROOT, 'apps/web-e2e/target/logs');

  readonly postsStore = new ServiceDatabase(POSTS_SCHEMA);
  readonly taggingStore = new ServiceDatabase(TAGGING_SCHEMA);

  private readonly containers = new ContainerStack();
  private web?: Service;

  async up(): Promise<void> {
    mkdirSync(this.logDirectory, { recursive: true });
    const endpoints = await this.containers.up({
      transport: e2eTransport(),
      apiPort: await FreePort.pick(),
      webUrl: WEB_URL,
      authSecret: AUTH_SECRET,
      postsSchema: POSTS_SCHEMA,
      taggingSchema: TAGGING_SCHEMA,
      logs: (line) => appendFileSync(join(this.logDirectory, 'containers.log'), line),
    });

    this.publish(endpoints);

    try {
      await this.startWeb(endpoints);
    } catch (failure) {
      await this.down();
      throw failure;
    }
  }

  async down(): Promise<void> {
    this.web?.stop();
    this.web = undefined;
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
        POSTS_SCHEMA,
        TAGGING_SCHEMA,
        AUTH_SECRET,
        WEB_URL,
        NEXT_PUBLIC_API_URL: endpoints.apiUrl,
        PORT: String(WEB_PORT),
        MIKRO_ORM_DEBUG: 'false',
      },
      this.logDirectory,
    );
    this.web.start();
    await this.web.waitUntilReady();
  }

  private async isWebUp(): Promise<boolean> {
    try {
      return (await fetch(`${WEB_URL}/login`, { redirect: 'manual' })).status < 500;
    } catch {
      return false;
    }
  }
}
