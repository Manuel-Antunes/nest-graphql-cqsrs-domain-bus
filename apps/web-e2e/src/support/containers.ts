import { createServer } from 'node:net';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  GenericContainer,
  Network,
  Wait,
  type StartedNetwork,
  type StartedTestContainer,
} from 'testcontainers';

export const POSTGRES_IMAGE = 'postgres:18-alpine';
export const RABBITMQ_IMAGE = 'rabbitmq:4-management';

export const POSTGRES_USER = 'nestposts';
export const POSTGRES_PASSWORD = 'nestposts';
export const POSTGRES_DB = 'nestposts';

/** Where the host reaches what the containers publish. Everything else is an alias on the network. */
export interface Endpoints {
  readonly postgresUrl: string;
  readonly rabbitmqUrl: string;
  readonly managementUrl: string;
  readonly apiUrl: string;
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
        const port = typeof address === 'object' && address !== null ? address.port : 0;
        probe.close(() => (port === 0 ? reject(new Error('no free port')) : resolve(port)));
      });
    });
  }
}

export interface ContainerStackOptions {
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
  private postsApi?: StartedTestContainer;
  private tagging?: StartedTestContainer;

  async up(options: ContainerStackOptions): Promise<Endpoints> {
    this.network = await new Network().start();
    await this.startInfrastructure();
    await this.migrate(options);
    await this.startApplications(options);
    return this.endpoints(options.apiPort);
  }

  async down(): Promise<void> {
    for (const container of [this.postsApi, this.tagging, this.rabbitmq, this.postgres]) {
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

  private async startInfrastructure(): Promise<void> {
    this.postgres = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withNetwork(this.network!)
      .withNetworkAliases('postgres')
      .withDatabase(POSTGRES_DB)
      .withUsername(POSTGRES_USER)
      .withPassword(POSTGRES_PASSWORD)
      .start();

    this.rabbitmq = await new GenericContainer(RABBITMQ_IMAGE)
      .withNetwork(this.network!)
      .withNetworkAliases('rabbitmq')
      .withExposedPorts(5672, 15672)
      .withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
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

  private async startApplications(options: ContainerStackOptions): Promise<void> {
    const apiUrl = `http://localhost:${options.apiPort}`;
    const shared = {
      POSTGRES_URL: this.internalPostgresUrl,
      RABBITMQ_URL: this.internalRabbitmqUrl,
      POSTS_SCHEMA: options.postsSchema,
      TAGGING_SCHEMA: options.taggingSchema,
      AUTH_SECRET: options.authSecret,
      MIKRO_ORM_DEBUG: 'false',
    };

    this.tagging = await new GenericContainer('nestposts/tagging:dev')
      .withNetwork(this.network!)
      .withNetworkAliases('tagging')
      .withEnvironment({ ...shared, TAGGING_TRANSPORT: 'rabbitmq' })
      .withWaitStrategy(Wait.forLogMessage(/tagging is listening/))
      .withLogConsumer((stream) => stream.on('data', (line) => options.logs(`tagging ${line}`)))
      .start();

    this.postsApi = await new GenericContainer('nestposts/posts-api:dev')
      .withNetwork(this.network!)
      .withNetworkAliases('posts-api')
      .withExposedPorts({ container: 3000, host: options.apiPort })
      .withEnvironment({
        ...shared,
        PORT: '3000',
        POSTS_TRANSPORT: 'rabbitmq',
        AUTH_URL: apiUrl,
        WEB_URL: options.webUrl,
        AUTH_TRUSTED_ORIGINS: `${apiUrl},${options.webUrl}`,
      })
      .withWaitStrategy(Wait.forLogMessage(/Nest application successfully started/))
      .withLogConsumer((stream) => stream.on('data', (line) => options.logs(`posts-api ${line}`)))
      .start();
  }

  private endpoints(apiPort: number): Endpoints {
    const host = this.rabbitmq!.getHost();
    return {
      postgresUrl: this.postgres!.getConnectionUri(),
      rabbitmqUrl: `amqp://guest:guest@${host}:${this.rabbitmq!.getMappedPort(5672)}`,
      managementUrl: `http://${host}:${this.rabbitmq!.getMappedPort(15672)}`,
      apiUrl: `http://localhost:${apiPort}`,
    };
  }
}
