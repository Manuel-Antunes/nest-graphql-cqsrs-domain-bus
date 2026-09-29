/** biome-ignore-all lint/style/noNonNullAssertion: allow non null */
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import { GenericContainer, Network, Wait } from 'testcontainers';

import type {
  E2eTransport,
  Endpoints,
  PostsSubscriptionSource,
} from '../environment/run-environment';
import { Storage } from '../infrastructure/storage/storage';
import { EmailSender } from '../model/email';
import { Poll } from '../support/poll';

export interface ContainerStackOptions {
  /** Which transport this run drives the system over. */
  readonly transport: E2eTransport;
  readonly postsSubscriptionSource: PostsSubscriptionSource;
  readonly apiPort: number;
  /** Chosen up front: the gateway's URL is the audience every OAuth access token is issued for. */
  readonly gatewayPort: number;
  readonly storagePort: number;
  readonly webUrl: string;
  readonly authSecret: string;
  readonly logLevel: string;
  readonly logs: (line: string) => void;
}

/**
 * **Everything but the web, as containers on one network** — Postgres, Redis, MinIO, Mailpit, the
 * broker or the Inngest dev server, the migrator, and `posts-api`, `tagging`, `notificator` and the
 * `gateway`. Every one of them that holds Better Auth is given the same Redis, the web included: a
 * session is kept there in front of its row, and a process reading only the row would disagree with
 * the others about which sessions are still valid.
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
  private static readonly POSTGRES_IMAGE = 'postgres:18-alpine';
  private static readonly RABBITMQ_IMAGE = 'rabbitmq:4-management';
  private static readonly INNGEST_IMAGE = 'inngest/inngest:latest';
  private static readonly MAILPIT_IMAGE = 'axllent/mailpit:latest';
  private static readonly MINIO_IMAGE = 'pgsty/minio:latest';
  private static readonly REDIS_IMAGE = 'redis:7-alpine';

  private static readonly MAILPIT_SMTP_PORT = 1025;
  private static readonly MAILPIT_API_PORT = 8025;
  private static readonly MINIO_PORT = 9000;
  private static readonly REDIS_PORT = 6379;
  private static readonly TAGGING_PORT = 3001;
  private static readonly NOTIFICATOR_PORT = 3002;
  private static readonly GATEWAY_PORT = 4000;

  private static readonly POSTGRES_USER = 'nestposts';
  private static readonly POSTGRES_PASSWORD = 'nestposts';
  private static readonly POSTGRES_DB = 'nestposts';

  private network?: StartedNetwork;
  private postgres?: StartedPostgreSqlContainer;
  private redis?: StartedTestContainer;
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
        `http://${this.tagging?.getHost()}:${this.tagging?.getMappedPort(ContainerStack.TAGGING_PORT)}`,
      );
      await this.register(
        `http://${this.notificator?.getHost()}:${this.notificator?.getMappedPort(ContainerStack.NOTIFICATOR_PORT)}`,
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
      this.redis,
      this.postgres,
    ]) {
      await container?.stop({ timeout: 10 }).catch(() => undefined);
    }
    await this.network?.stop().catch(() => undefined);
  }

  private get internalPostgresUrl(): string {
    return `postgresql://${ContainerStack.POSTGRES_USER}:${ContainerStack.POSTGRES_PASSWORD}@postgres:5432/${ContainerStack.POSTGRES_DB}`;
  }

  private get internalRabbitmqUrl(): string {
    return 'amqp://guest:guest@rabbitmq:5672';
  }

  private get internalRedisUrl(): string {
    return `redis://redis:${ContainerStack.REDIS_PORT}`;
  }

  private async startInfrastructure(
    options: ContainerStackOptions,
  ): Promise<void> {
    this.postgres = await new PostgreSqlContainer(ContainerStack.POSTGRES_IMAGE)
      .withNetwork(this.network!)
      .withNetworkAliases('postgres')
      .withDatabase(ContainerStack.POSTGRES_DB)
      .withUsername(ContainerStack.POSTGRES_USER)
      .withPassword(ContainerStack.POSTGRES_PASSWORD)
      .start();

    this.redis = await new GenericContainer(ContainerStack.REDIS_IMAGE)
      .withNetwork(this.network!)
      .withNetworkAliases('redis')
      .withExposedPorts(ContainerStack.REDIS_PORT)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start();

    await this.startStorage(options);

    this.mailpit = await new GenericContainer(ContainerStack.MAILPIT_IMAGE)
      .withNetwork(this.network!)
      .withNetworkAliases('mailpit')
      .withExposedPorts(ContainerStack.MAILPIT_API_PORT)
      .withWaitStrategy(Wait.forHttp('/livez', ContainerStack.MAILPIT_API_PORT))
      .start();

    if (options.transport !== 'rabbitmq') {
      return;
    }

    this.rabbitmq = await new GenericContainer(ContainerStack.RABBITMQ_IMAGE)
      .withNetwork(this.network!)
      .withNetworkAliases('rabbitmq')
      .withExposedPorts(5672, 15672)
      .withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
      .start();
  }

  private async startStorage(options: ContainerStackOptions): Promise<void> {
    this.minio = await new GenericContainer(ContainerStack.MINIO_IMAGE)
      .withNetwork(this.network!)
      .withNetworkAliases('minio')
      .withExposedPorts({
        container: ContainerStack.MINIO_PORT,
        host: options.storagePort,
      })
      .withEnvironment({
        MINIO_ROOT_USER: Storage.USER,
        MINIO_ROOT_PASSWORD: Storage.PASSWORD,
      })
      .withCommand(['server', '/data'])
      .withWaitStrategy(
        Wait.forHttp('/minio/health/live', ContainerStack.MINIO_PORT),
      )
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
    this.inngest = await new GenericContainer(ContainerStack.INNGEST_IMAGE)
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
        `http://tagging:${ContainerStack.TAGGING_PORT}/api/inngest`,
        '-u',
        `http://notificator:${ContainerStack.NOTIFICATOR_PORT}/api/inngest`,
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
        REDIS_URL: this.internalRedisUrl,
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
      REDIS_URL: this.internalRedisUrl,
      INNGEST_BASE_URL: 'http://inngest:8288',
      AUTH_SECRET: options.authSecret,
      WEB_URL: options.webUrl,
      GATEWAY_URL: this.gatewayUrl(options),
      MIKRO_ORM_DEBUG: 'false',
      LOG_LEVEL: options.logLevel,
    };

    this.tagging = await new GenericContainer('nestposts/tagging:dev')
      .withNetwork(this.network!)
      .withNetworkAliases('tagging')
      .withExposedPorts(ContainerStack.TAGGING_PORT)
      .withEnvironment({
        ...shared,
        TAGGING_TRANSPORT: options.transport,
        TAGGING_PORT: String(ContainerStack.TAGGING_PORT),
        TAGGING_RETRY_DELAY_MS: '1000',
        INNGEST_SERVE_ORIGIN: `http://tagging:${ContainerStack.TAGGING_PORT}`,
      })
      .withWaitStrategy(Wait.forLogMessage(/tagging is listening/))
      .withLogConsumer((stream) =>
        stream.on('data', (line) => options.logs(`tagging ${line}`)),
      )
      .start();

    this.notificator = await new GenericContainer('nestposts/notificator:dev')
      .withNetwork(this.network!)
      .withNetworkAliases('notificator')
      .withExposedPorts(ContainerStack.NOTIFICATOR_PORT)
      .withEnvironment({
        ...shared,
        NOTIFICATOR_TRANSPORT: options.transport,
        NOTIFICATOR_PORT: String(ContainerStack.NOTIFICATOR_PORT),
        NOTIFICATOR_RETRY_DELAY_MS: '1000',
        INNGEST_SERVE_ORIGIN: `http://notificator:${ContainerStack.NOTIFICATOR_PORT}`,
        MAIL_TRANSPORT: 'smtp',
        MAIL_SMTP_URL: `smtp://mailpit:${ContainerStack.MAILPIT_SMTP_PORT}`,
        MAIL_FROM: EmailSender.header,
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
        POSTS_SUBSCRIPTION_SOURCE: options.postsSubscriptionSource,
        INNGEST_SERVE_ORIGIN: 'http://posts-api:3000',
        AUTH_URL: apiUrl,
        WEB_URL: options.webUrl,
        AUTH_TRUSTED_ORIGINS: `${apiUrl},${options.webUrl}`,
        AUTH_RATE_LIMIT: 'false',
        DRIVE_BUCKET: Storage.BUCKET,
        DRIVE_AWS_REGION: Storage.REGION,
        DRIVE_AWS_ACCESS_KEY_ID: Storage.USER,
        DRIVE_AWS_SECRET_ACCESS_KEY: Storage.PASSWORD,
        DRIVE_S3_ENDPOINT: `http://minio:${ContainerStack.MINIO_PORT}`,
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
      .withExposedPorts({
        container: ContainerStack.GATEWAY_PORT,
        host: options.gatewayPort,
      })
      .withEnvironment({
        GATEWAY_PORT: String(ContainerStack.GATEWAY_PORT),
        GATEWAY_URL: this.gatewayUrl(options),
        POSTS_SUBGRAPH_URL: 'http://posts-api:3000/graphql',
        NOTIFICATIONS_SUBGRAPH_URL: `http://notificator:${ContainerStack.NOTIFICATOR_PORT}/graphql`,
        POSTGRES_URL: this.internalPostgresUrl,
        REDIS_URL: this.internalRedisUrl,
        AUTH_SECRET: options.authSecret,
        WEB_URL: options.webUrl,
        AUTH_URL: `http://localhost:${options.apiPort}`,
        MIKRO_ORM_DEBUG: 'false',
        LOG_LEVEL: options.logLevel,
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
      await Poll.pause(500);
    }
  }

  private endpoints(options: ContainerStackOptions): Endpoints {
    return {
      postgresUrl: this.postgres!.getConnectionUri(),
      apiUrl: `http://localhost:${options.apiPort}`,
      gatewayUrl: this.gatewayUrl(options),
      storageUrl: this.storageUrl(options),
      mailboxUrl: `http://${this.mailpit!.getHost()}:${this.mailpit!.getMappedPort(ContainerStack.MAILPIT_API_PORT)}`,
      redisUrl: `redis://${this.redis!.getHost()}:${this.redis!.getMappedPort(ContainerStack.REDIS_PORT)}`,
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
