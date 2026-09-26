import { Workspace } from './workspace';

export type E2eTransport = 'inngest' | 'rabbitmq';

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
 * **Where the stack ended up, as the one channel a worker can read it through: the environment.**
 *
 * A Playwright worker is a process of its own, forked **after** the global setup ran, and what it
 * inherits is exactly what `publish` wrote. Every value is read per call, never captured: the
 * containers are on ports Docker chose, so a value read when a module is first imported would freeze
 * the default from before there was a stack.
 *
 * **Which transport this run drives the system over** is read here too. Inngest is the default,
 * because it is what a developer gets by default; `E2E_TRANSPORT=rabbitmq` is the other run, and
 * `pnpm test:web` does both. What is true on one is asserted on both; what only a broker has stays in
 * the run that has one.
 */
export class RunEnvironment {
  static readonly ROOT_TENANT = 'root';

  constructor(private readonly variables: NodeJS.ProcessEnv = process.env) {}

  get transport(): E2eTransport {
    return this.variables.E2E_TRANSPORT === 'rabbitmq' ? 'rabbitmq' : 'inngest';
  }

  get webPort(): number {
    return Number(this.variables.WEB_PORT ?? 4300);
  }

  get webUrl(): string {
    return this.variables.WEB_URL ?? `http://localhost:${this.webPort}`;
  }

  get authSecret(): string {
    return this.variables.AUTH_SECRET ?? 'nestposts-web-e2e-secret';
  }

  get apiUrl(): string {
    return this.variables.API_URL ?? 'http://localhost:3000';
  }

  get gatewayUrl(): string {
    return this.variables.GATEWAY_URL ?? 'http://localhost:4000/graphql';
  }

  get postgresUrl(): string {
    return (
      this.variables.POSTGRES_URL ??
      'postgresql://nestposts:nestposts@localhost:5432/nestposts'
    );
  }

  get mailboxUrl(): string {
    return this.variables.E2E_MAILBOX_URL ?? 'http://localhost:8025';
  }

  get storageUrl(): string {
    return this.variables.E2E_STORAGE_URL ?? 'http://localhost:9000';
  }

  get managementUrl(): string {
    return this.variables.RABBITMQ_MANAGEMENT ?? 'http://localhost:15672';
  }

  get brokerUser(): string {
    return this.variables.RABBITMQ_USER ?? 'guest';
  }

  get brokerPassword(): string {
    return this.variables.RABBITMQ_PASSWORD ?? 'guest';
  }

  get inngestUrl(): string {
    return this.variables.INNGEST_BASE_URL ?? 'http://localhost:8288';
  }

  get logLevel(): string {
    return this.variables.E2E_LOG_LEVEL ?? 'info';
  }

  get logDirectory(): string {
    return (
      this.variables.E2E_LOGS ?? Workspace.path('apps/web-e2e/target/logs')
    );
  }

  get keepsStack(): boolean {
    return this.variables.E2E_KEEP_STACK === '1';
  }

  publish(endpoints: Endpoints): void {
    this.variables.POSTGRES_URL = endpoints.postgresUrl;
    this.variables.API_URL = endpoints.apiUrl;
    this.variables.GATEWAY_URL = endpoints.gatewayUrl;
    this.variables.E2E_STORAGE_URL = endpoints.storageUrl;
    this.variables.E2E_MAILBOX_URL = endpoints.mailboxUrl;
    if (endpoints.managementUrl) {
      this.variables.RABBITMQ_MANAGEMENT = endpoints.managementUrl;
    }
    if (endpoints.inngestUrl) {
      this.variables.INNGEST_BASE_URL = endpoints.inngestUrl;
    }
  }
}
