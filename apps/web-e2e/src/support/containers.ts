/** biome-ignore-all lint/style/noNonNullAssertion: allow non null */
import { createServer } from 'node:net';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import { GenericContainer, Network, Wait } from 'testcontainers';

import { MAILPIT_API_PORT, MAILPIT_IMAGE, MAILPIT_SMTP_PORT } from './mailbox';
import {
  MINIO_IMAGE,
  MINIO_PORT,
  STORAGE_BUCKET,
  STORAGE_PASSWORD,
  STORAGE_REGION,
  STORAGE_USER,
  Storage,
} from './storage';
import type { E2eTransport } from './transport';

export const POSTGRES_IMAGE = 'postgres:18-alpine';
export const RABBITMQ_IMAGE = 'rabbitmq:4-management';
export const INNGEST_IMAGE = 'inngest/inngest:latest';

const TAGGING_PORT = 3001;
const NOTIFICATOR_PORT = 3002;
const GATEWAY_PORT = 4000;

export const MAIL_FROM = 'Nest Posts <no-reply@nestposts.test>';

export const POSTGRES_USER = 'nestposts';
export const POSTGRES_PASSWORD = 'nestposts';
export const POSTGRES_DB = 'nestposts';

/** Where the host reaches what the containers publish. Everything else is an alias on the network. */
export interface Endpoints {
  readonly postgresUrl: string;
  readonly apiUrl: string;
  /** The federation gateway — where the web sends every operation. */
  readonly gatewayUrl: string;
  readonly storageUrl: string;
  /** Mailpit's API: every email the notificator sent. */
  readonly mailboxUrl: string;
  /** The broker's management API, on the run that has a broker. */
  readonly managementUrl?: string;
  /** The broker itself, as the host reaches it — where the web process publishes on that run. */
  readonly brokerUrl?: string;
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
  /** Chosen up front: the gateway's URL is the audience every OAuth access token is issued for. */
  readonly gatewayPort: number;
  readonly storagePort: number;
  readonly webUrl: string;
  readonly authSecret: string;
  readonly logs: (line: string) => void;
}

/**
 * **Everything but the web, as containers on one network** — Postgres, MinIO, Mailpit, the broker or
 * the Inngest dev server, the migrator, and `posts-api`, `tagging` and `notificator`.
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
  private minio?: StartedTestContainer;
  private rabbitmq?: StartedTestContainer;
  private inngest?: StartedTestContainer;
  private mailpit?: StartedTestContainer;
  private postsApi?: StartedTestContainer;
  private tagging?: StartedTestContainer;
  private notificator?: StartedTestContainer;
  private gateway?: StartedTestContainer;

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
      await this.register(
        `http://${this.notificator?.getHost()}:${this.notificator?.getMappedPort(NOTIFICATOR_PORT)}`,
      );
    }
    return this.endpoints(options);
  }

  async down(): Promise<void> {
    for (const container of [
      this.gateway,
      this.postsApi,
      this.tagging,
      this.notificator,
      this.inngest,
      this.mailpit,
      this.rabbitmq,
      this.minio,
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

    await this.startStorage(options);

    this.mailpit = await new GenericContainer(MAILPIT_IMAGE)
      .withNetwork(this.network!)
      .withNetworkAliases('mailpit')
      .withExposedPorts(MAILPIT_API_PORT)
      .withWaitStrategy(Wait.forHttp('/livez', MAILPIT_API_PORT))
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

  private async startStorage(options: ContainerStackOptions): Promise<void> {
    this.minio = await new GenericContainer(MINIO_IMAGE)
      .withNetwork(this.network!)
      .withNetworkAliases('minio')
      .withExposedPorts({ container: MINIO_PORT, host: options.storagePort })
      .withEnvironment({
        MINIO_ROOT_USER: STORAGE_USER,
        MINIO_ROOT_PASSWORD: STORAGE_PASSWORD,
      })
      .withCommand(['server', '/data'])
      .withWaitStrategy(Wait.forHttp('/minio/health/live', MINIO_PORT))
      .start();

    const storage = new Storage(this.storageUrl(options));
    try {
      await storage.prepare();
    } finally {
      storage.close();
    }
  }

  private storageUrl(options: ContainerStackOptions): string {
    return `http://localhost:${options.storagePort}`;
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
        '-u',
        `http://notificator:${NOTIFICATOR_PORT}/api/inngest`,
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
        AUTH_SECRET: options.authSecret,
        GATEWAY_URL: this.gatewayUrl(options),
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
      AUTH_SECRET: options.authSecret,
      WEB_URL: options.webUrl,
      GATEWAY_URL: this.gatewayUrl(options),
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

    this.notificator = await new GenericContainer('nestposts/notificator:dev')
      .withNetwork(this.network!)
      .withNetworkAliases('notificator')
      .withExposedPorts(NOTIFICATOR_PORT)
      .withEnvironment({
        ...shared,
        NOTIFICATOR_TRANSPORT: options.transport,
        NOTIFICATOR_PORT: String(NOTIFICATOR_PORT),
        NOTIFICATOR_RETRY_DELAY_MS: '1000',
        INNGEST_SERVE_ORIGIN: `http://notificator:${NOTIFICATOR_PORT}`,
        MAIL_TRANSPORT: 'smtp',
        MAIL_SMTP_URL: `smtp://mailpit:${MAILPIT_SMTP_PORT}`,
        MAIL_FROM,
      })
      .withWaitStrategy(Wait.forLogMessage(/notificator is listening/))
      .withLogConsumer((stream) =>
        stream.on('data', (line) => options.logs(`notificator ${line}`)),
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
        AUTH_RATE_LIMIT: 'false',
        DRIVE_BUCKET: STORAGE_BUCKET,
        DRIVE_AWS_REGION: STORAGE_REGION,
        DRIVE_AWS_ACCESS_KEY_ID: STORAGE_USER,
        DRIVE_AWS_SECRET_ACCESS_KEY: STORAGE_PASSWORD,
        DRIVE_S3_ENDPOINT: `http://minio:${MINIO_PORT}`,
        DRIVE_S3_PUBLIC_ENDPOINT: this.storageUrl(options),
        DRIVE_S3_FORCE_PATH_STYLE: 'true',
      })
      .withWaitStrategy(
        Wait.forLogMessage(/Nest application successfully started/),
      )
      .withLogConsumer((stream) =>
        stream.on('data', (line) => options.logs(`posts-api ${line}`)),
      )
      .start();

    this.gateway = await new GenericContainer('nestposts/gateway:dev')
      .withNetwork(this.network!)
      .withNetworkAliases('gateway')
      .withExposedPorts({ container: GATEWAY_PORT, host: options.gatewayPort })
      .withEnvironment({
        GATEWAY_PORT: String(GATEWAY_PORT),
        GATEWAY_URL: this.gatewayUrl(options),
        POSTS_SUBGRAPH_URL: 'http://posts-api:3000/graphql',
        NOTIFICATIONS_SUBGRAPH_URL: `http://notificator:${NOTIFICATOR_PORT}/graphql`,
        WEB_URL: options.webUrl,
        AUTH_URL: 'http://posts-api:3000',
        LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'info',
      })
      .withWaitStrategy(Wait.forLogMessage(/gateway at http/))
      .withLogConsumer((stream) =>
        stream.on('data', (line) => options.logs(`gateway ${line}`)),
      )
      .start();
  }

  private gatewayUrl(options: ContainerStackOptions): string {
    return `http://localhost:${options.gatewayPort}/graphql`;
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

  private endpoints(options: ContainerStackOptions): Endpoints {
    return {
      postgresUrl: this.postgres!.getConnectionUri(),
      apiUrl: `http://localhost:${options.apiPort}`,
      gatewayUrl: this.gatewayUrl(options),
      storageUrl: this.storageUrl(options),
      mailboxUrl: `http://${this.mailpit!.getHost()}:${this.mailpit!.getMappedPort(MAILPIT_API_PORT)}`,
      ...(this.rabbitmq
        ? {
            managementUrl: `http://${this.rabbitmq.getHost()}:${this.rabbitmq.getMappedPort(15672)}`,
            brokerUrl: `amqp://guest:guest@${this.rabbitmq.getHost()}:${this.rabbitmq.getMappedPort(5672)}`,
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
