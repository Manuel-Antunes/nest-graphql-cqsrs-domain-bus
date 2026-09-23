/** biome-ignore-all lint/style/noNonNullAssertion: allow non null */
import { createServer } from 'node:net';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import { GenericContainer, Network, Wait } from 'testcontainers';

import type { E2eTransport } from './transport';

export const POSTGRES_IMAGE = 'postgres:18-alpine';
export const RABBITMQ_IMAGE = 'rabbitmq:4-management';
export const INNGEST_IMAGE = 'inngest/inngest:latest';

const TAGGING_PORT = 3001;

export const POSTGRES_USER = 'nestposts';
export const POSTGRES_PASSWORD = 'nestposts';
export const POSTGRES_DB = 'nestposts';

/** Where the host reaches what the containers publish. Everything else is an alias on the network. */
export interface Endpoints {
  readonly postgresUrl: string;
  readonly apiUrl: string;
  /** The broker's management API, on the run that has a broker. */
  readonly managementUrl?: string;
  /** The Inngest dev server, on the run that has one — its `/v1/events` is that run's wire. */
  readonly inngestUrl?: string;
}

/**
 * A host port nothing is listening on, taken by listening on **zero** and letting the kernel choose.
 *
 * It exists for the two addresses something has to know about itself before it starts: the API's
 * own origin, which it signs cookies against, and the web's. Testcontainers maps a port only after
 * a container is up, which is one round too late for a value the container needs at boot.
 */
export class FreePort {
  static pick(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        const port =
          typeof address === 'object' && address !== null ? address.port : 0;
        probe.close(() =>
          port === 0 ? reject(new Error('no free port')) : resolve(port),
        );
      });
    });
  }
}

export interface ContainerStackOptions {
  /** Which transport this run drives the system over — see `support/transport.ts`. */
  readonly transport: E2eTransport;
  readonly apiPort: number;
  readonly webUrl: string;
  readonly authSecret: string;
  readonly postsSchema: string;
  readonly taggingSchema: string;
  readonly logs: (line: string) => void;
}

/**
 * **Everything but the web, as containers on one network.**
 *
 * The images are the ones `apps/<app>/Dockerfile` build and `nx run <app>:docker:build` tags — the same
 * ones `docker compose --profile apps up` runs — so what this suite drives is what that profile
 * serves, not a second description of it.
 *
 * INSIDE the network every address is an alias on the service's real port (`postgres:5432`,
 * `rabbitmq:5672`), which is why nothing here has to learn a port before it starts. Only what the
 * HOST has to reach is published, and all of it but the API is mapped wherever Docker likes: the
 * suite reads the mapping back and publishes it as environment, which is how a Playwright worker —
 * a process that never saw any of this — finds the database it is about to make assertions about.
 *
 * The clean slate is the container itself. There is no schema to drop and no queue to delete, which
 * is what the compose-based version spent its first seconds doing.
 */
export class ContainerStack {
  private network?: StartedNetwork;
  private postgres?: StartedPostgreSqlContainer;
  private rabbitmq?: StartedTestContainer;
  private inngest?: StartedTestContainer;
  private postsApi?: StartedTestContainer;
  private tagging?: StartedTestContainer;

  async up(options: ContainerStackOptions): Promise<Endpoints> {
    this.network = await new Network().start();
    await this.startInfrastructure(options);
    await this.migrate(options);
    await this.startApplications(options);
    if (options.transport === 'inngest') {
      await this.startInngest();
      await this.register(`http://localhost:${options.apiPort}`);
      await this.register(
        `http://${this.tagging?.getHost()}:${this.tagging?.getMappedPort(TAGGING_PORT)}`,
      );
    }
    return this.endpoints(options.apiPort);
  }

  async down(): Promise<void> {
    for (const container of [
      this.postsApi,
      this.tagging,
      this.inngest,
      this.rabbitmq,
      this.postgres,
    ]) {
      await container?.stop({ timeout: 10 }).catch(() => undefined);
    }
    await this.network?.stop().catch(() => undefined);
  }

  private get internalPostgresUrl(): string {
    return `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`;
  }

  private get internalRabbitmqUrl(): string {
    return 'amqp://guest:guest@rabbitmq:5672';
  }

  private async startInfrastructure(
    options: ContainerStackOptions,
  ): Promise<void> {
    this.postgres = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withNetwork(this.network!)
      .withNetworkAliases('postgres')
      .withDatabase(POSTGRES_DB)
      .withUsername(POSTGRES_USER)
      .withPassword(POSTGRES_PASSWORD)
      .start();

    if (options.transport !== 'rabbitmq') {
      return;
    }

    this.rabbitmq = await new GenericContainer(RABBITMQ_IMAGE)
      .withNetwork(this.network!)
      .withNetworkAliases('rabbitmq')
      .withExposedPorts(5672, 15672)
      .withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
      .start();
  }

  /**
   * **The dev server starts LAST, and that is the whole of it.** It is told where each service serves
   * its functions, and it resolves those addresses on the network — so starting it before the
   * containers those aliases name exist leaves it pointed at names that do not resolve. The
   * applications do not need it at boot: they reach it when they publish, and by then it is up.
   */
  private async startInngest(): Promise<void> {
    this.inngest = await new GenericContainer(INNGEST_IMAGE)
      .withNetwork(this.network!)
      .withNetworkAliases('inngest')
      .withExposedPorts(8288)
      .withCommand([
        'inngest',
        'dev',
        '--no-discovery',
        '-u',
        'http://posts-api:3000/api/inngest',
        '-u',
        `http://tagging:${TAGGING_PORT}/api/inngest`,
      ])
      .withWaitStrategy(Wait.forLogMessage(/starting server/))
      .start();
  }

  /**
   * The migrator is the same image the deploy invokes and the compose profile runs, as a **one-shot**:
   * it is waited on until it exits 0, so nothing else starts against a schema that does not exist yet.
   */
  private async migrate(options: ContainerStackOptions): Promise<void> {
    const migrator = await new GenericContainer('nestposts/migrator:dev')
      .withNetwork(this.network!)
      .withEnvironment({
        POSTGRES_URL: this.internalPostgresUrl,
        POSTS_SCHEMA: options.postsSchema,
        TAGGING_SCHEMA: options.taggingSchema,
        AUTH_SECRET: options.authSecret,
      })
      .withCommand(['setup'])
      .withWaitStrategy(Wait.forOneShotStartup())
      .start();
    await migrator.stop({ timeout: 10 }).catch(() => undefined);
  }

  private async startApplications(
    options: ContainerStackOptions,
  ): Promise<void> {
    const apiUrl = `http://localhost:${options.apiPort}`;
    const shared = {
      POSTGRES_URL: this.internalPostgresUrl,
      RABBITMQ_URL: this.internalRabbitmqUrl,
      INNGEST_BASE_URL: 'http://inngest:8288',
      POSTS_SCHEMA: options.postsSchema,
      TAGGING_SCHEMA: options.taggingSchema,
      AUTH_SECRET: options.authSecret,
      MIKRO_ORM_DEBUG: 'false',
      LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'info',
    };

    this.tagging = await new GenericContainer('nestposts/tagging:dev')
      .withNetwork(this.network!)
      .withNetworkAliases('tagging')
      .withExposedPorts(TAGGING_PORT)
      .withEnvironment({
        ...shared,
        TAGGING_TRANSPORT: options.transport,
        TAGGING_PORT: String(TAGGING_PORT),
        TAGGING_RETRY_DELAY_MS: '1000',
        INNGEST_SERVE_ORIGIN: `http://tagging:${TAGGING_PORT}`,
      })
      .withWaitStrategy(Wait.forLogMessage(/tagging is listening/))
      .withLogConsumer((stream) =>
        stream.on('data', (line) => options.logs(`tagging ${line}`)),
      )
      .start();

    this.postsApi = await new GenericContainer('nestposts/posts-api:dev')
      .withNetwork(this.network!)
      .withNetworkAliases('posts-api')
      .withExposedPorts({ container: 3000, host: options.apiPort })
      .withEnvironment({
        ...shared,
        PORT: '3000',
        POSTS_TRANSPORT: options.transport,
        INNGEST_SERVE_ORIGIN: 'http://posts-api:3000',
        AUTH_URL: apiUrl,
        WEB_URL: options.webUrl,
        AUTH_TRUSTED_ORIGINS: `${apiUrl},${options.webUrl}`,
      })
      .withWaitStrategy(
        Wait.forLogMessage(/Nest application successfully started/),
      )
      .withLogConsumer((stream) =>
        stream.on('data', (line) => options.logs(`posts-api ${line}`)),
      )
      .start();
  }

  /**
   * **A `PUT` on the serve endpoint is how a service tells Inngest what it has.** The dev server also
   * polls the `-u` addresses it was given, but it was started before these containers existed and a
   * suite cannot afford to wait out a poll it does not control: a saga that has not been routed yet
   * looks exactly like a saga that is broken.
   */
  private async register(baseUrl: string): Promise<void> {
    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        const response = await fetch(`${baseUrl}/api/inngest`, {
          method: 'PUT',
        });
        if (response.ok) {
          return;
        }
      } catch {
        // the server is up but the route may not be, which is what the deadline is for
      }
      if (Date.now() > deadline) {
        throw new Error(
          `${baseUrl}/api/inngest never registered its functions with Inngest`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private endpoints(apiPort: number): Endpoints {
    return {
      postgresUrl: this.postgres!.getConnectionUri(),
      apiUrl: `http://localhost:${apiPort}`,
      ...(this.rabbitmq
        ? {
            managementUrl: `http://${this.rabbitmq.getHost()}:${this.rabbitmq.getMappedPort(15672)}`,
          }
        : {}),
      ...(this.inngest
        ? {
            inngestUrl: `http://${this.inngest.getHost()}:${this.inngest.getMappedPort(8288)}`,
          }
        : {}),
    };
  }
}
