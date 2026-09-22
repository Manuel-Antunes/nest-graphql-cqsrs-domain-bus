import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { Broker } from './broker';
import { Compose, WORKSPACE_ROOT } from './docker';
import { POSTGRES_URL, ServiceDatabase } from './database';
import { PostsApi } from './posts-api';
import { HttpHealth, LogLine, Service, nestApplication, nextApplication } from './service';

export const POSTS_SCHEMA = process.env.POSTS_SCHEMA ?? 'posts';
export const TAGGING_SCHEMA = process.env.TAGGING_SCHEMA ?? 'tagging';

const RABBITMQ_URL =
  process.env.RABBITMQ_URL ??
  `amqp://${process.env.RABBITMQ_USER ?? 'guest'}:${process.env.RABBITMQ_PASSWORD ?? 'guest'}@localhost:5672`;

export const WEB_PORT = Number(process.env.WEB_PORT ?? 4300);

export const WEB_URL = process.env.WEB_URL ?? `http://localhost:${WEB_PORT}`;

export const AUTH_SECRET = process.env.AUTH_SECRET ?? 'nestposts-web-e2e-secret';

/**
 * **The whole system, provisioned once**: a browser's worth of it.
 *
 * The infrastructure comes from `docker-compose.yml` — reused when it is already up, which is what
 * lets this run against a broker or a database somebody else is holding. The three applications do
 * **not**: they are built and then started as processes, because what this suite exists to prove is
 * the real thing across real processes, and an image between the test and the code would prove
 * nothing more.
 *
 * `AUTH_SECRET` is one value for all of them, and that is the point rather than a convenience:
 * `apps/web` holds its own Better Auth and signs the session cookie itself, and `apps/posts-api`
 * resolves that same cookie against the same row. A different secret per process and the browser
 * would log in and be refused one hop later.
 */
export class Stack {
  readonly logDirectory = process.env.E2E_LOGS ?? join(WORKSPACE_ROOT, 'apps/web-e2e/target/logs');

  private readonly compose = new Compose();

  readonly broker = new Broker();
  readonly api = new PostsApi();
  readonly postsStore = new ServiceDatabase(POSTS_SCHEMA);
  readonly taggingStore = new ServiceDatabase(TAGGING_SCHEMA);

  private readonly environment: NodeJS.ProcessEnv = {
    POSTGRES_URL,
    RABBITMQ_URL,
    POSTS_SCHEMA,
    TAGGING_SCHEMA,
    AUTH_SECRET,
    MIKRO_ORM_DEBUG: 'false',
  };

  readonly postsApi = new Service(
    'posts-api',
    nestApplication('posts-api'),
    new HttpHealth(() => this.api.isHealthy(), this.api.graphqlUrl),
    {
      ...this.environment,
      PORT: '3000',
      POSTS_TRANSPORT: 'rabbitmq',
      POSTS_TAGGING_IN_PROCESS: 'false',
      AUTH_URL: this.api.url,
      WEB_URL,
      AUTH_TRUSTED_ORIGINS: `${this.api.url},${WEB_URL}`,
    },
    this.logDirectory,
  );

  readonly tagging = new Service(
    'tagging',
    nestApplication('tagging'),
    new LogLine('tagging is listening'),
    { ...this.environment, TAGGING_TRANSPORT: 'rabbitmq' },
    this.logDirectory,
  );

  readonly web = new Service(
    'web',
    nextApplication('web', WEB_PORT),
    new HttpHealth(() => this.isWebUp(), WEB_URL),
    {
      ...this.environment,
      WEB_URL,
      NEXT_PUBLIC_API_URL: this.api.url,
      PORT: String(WEB_PORT),
    },
    this.logDirectory,
  );

  private get services(): Service[] {
    return [this.postsApi, this.tagging, this.web];
  }

  private async isWebUp(): Promise<boolean> {
    try {
      return (await fetch(`${WEB_URL}/login`, { redirect: 'manual' })).status < 500;
    } catch {
      return false;
    }
  }

  async up(): Promise<void> {
    await this.startInfrastructure();
    await this.broker.deleteKnownQueues();
    this.recreateSchemas();
    this.migrate();
    try {
      await this.startApplications();
    } catch (failure) {
      this.stop();
      throw failure;
    }
  }

  down(): void {
    this.stop();
  }

  private stop(): void {
    for (const service of this.services) {
      service.stop();
    }
  }

  private async startInfrastructure(): Promise<void> {
    const services = [];
    if (!(await this.broker.isUp())) {
      services.push('rabbitmq');
    }
    if (!this.compose.isRunning('postgres')) {
      services.push('postgres');
    }
    if (services.length > 0) {
      await this.compose.up(...services);
    }
  }

  /**
   * Both schemas are rebuilt from nothing, which is what replaces deleting a database file — and the
   * reason this suite is not run against a database anybody cares about. They are the ordinary
   * `posts` and `tagging` and not throwaway names, because a migration's SQL is qualified with the
   * schema it was generated in: only the entities can build a schema under another name.
   */
  private recreateSchemas(): void {
    this.compose.exec(
      'postgres',
      'psql',
      '-U',
      process.env.POSTGRES_USER ?? 'nestposts',
      '-d',
      process.env.POSTGRES_DB ?? 'nestposts',
      '-q',
      '-c',
      `drop schema if exists "${POSTS_SCHEMA}" cascade; drop schema if exists "${TAGGING_SCHEMA}" cascade;`,
    );
  }

  private migrate(): void {
    this.run('node', join('apps', 'migrator', 'dist', 'main.js'), 'setup');
  }

  private async startApplications(): Promise<void> {
    for (const service of this.services) {
      service.start();
    }
    await Promise.all(this.services.map((service) => service.waitUntilReady()));
  }

  private run(command: string, ...args: string[]): void {
    execFileSync(command, args, {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, ...this.environment },
      stdio: 'pipe',
      maxBuffer: 64 * 1024 * 1024,
    });
  }
}
