import type { Endpoints } from '../environment/run-environment';
import { FreePort } from './free-port';
import { HttpHealth, Launch, Service } from './service';

export interface ChatwootStackOptions {
  readonly endpoints: Endpoints;
  readonly webUrl: string;
  readonly authSecret: string;
  readonly logDirectory: string;
}

/**
 * **Chatwoot, as processes on the host**: its schema prepared in the run's Postgres, then Rails and
 * the Vite dev server its dashboard loads from.
 *
 * A process and not an image, for the reason the web is one: the dashboard is under the browser, and
 * its production image rebuilds every asset of the Inertia frontend on any change — a heap of 8 GB
 * and minutes of build before a run can start. The gateway, a container, reaches it through the host
 * port `ContainerStack` exposes to the network.
 *
 * The schema is prepared AFTER the migrator and BEFORE any account is registered: every user,
 * organization and member the suite creates from then on is mirrored into Chatwoot by the platform's
 * triggers, which is part of what the suite proves.
 */
export class ChatwootStack {
  private readonly services: Service[] = [];

  async up(options: ChatwootStackOptions): Promise<void> {
    const environment = await ChatwootStack.environmentFor(options);
    await this.service(
      'chatwoot-prepare',
      Launch.rails('db:chatwoot_prepare'),
      environment,
      options,
    ).run();

    const vite = this.service(
      'chatwoot-vite',
      Launch.vite(),
      environment,
      options,
    );
    const rails = this.service(
      'chatwoot',
      Launch.rails('server', '-p', new URL(options.endpoints.chatwootUrl).port),
      environment,
      options,
      () => ChatwootStack.answers(`${options.endpoints.chatwootUrl}/api`),
    );
    vite.start();
    rails.start();
    await rails.waitUntilReady(180);
  }

  down(): void {
    for (const service of this.services.splice(0)) {
      service.stop();
    }
  }

  private service(
    name: string,
    launch: Launch,
    environment: NodeJS.ProcessEnv,
    { endpoints, logDirectory }: ChatwootStackOptions,
    probe: () => Promise<boolean> = async () => true,
  ): Service {
    const service = new Service(
      name,
      launch,
      new HttpHealth(probe, endpoints.chatwootUrl),
      environment,
      logDirectory,
    );
    this.services.push(service);
    return service;
  }

  private static async environmentFor({
    endpoints,
    webUrl,
    authSecret,
  }: ChatwootStackOptions): Promise<NodeJS.ProcessEnv> {
    const postgres = new URL(endpoints.postgresUrl);
    return {
      RAILS_ENV: 'development',
      BUNDLE_GEMFILE: 'Gemfile',
      SKIP_TEST_DATABASE: 'true',
      POSTGRES_HOST: postgres.hostname,
      POSTGRES_PORT: postgres.port,
      POSTGRES_DATABASE: postgres.pathname.slice(1),
      POSTGRES_USERNAME: decodeURIComponent(postgres.username),
      POSTGRES_PASSWORD: decodeURIComponent(postgres.password),
      REDIS_URL: endpoints.redisUrl,
      FRONTEND_URL: endpoints.chatwootUrl,
      AUTH_SECRET: authSecret,
      WEB_URL: webUrl,
      GATEWAY_URL: endpoints.gatewayUrl,
      VITE_RUBY_PORT: String(await FreePort.pick()),
      RAILS_LOG_TO_STDOUT: 'true',
    };
  }

  private static async answers(url: string): Promise<boolean> {
    try {
      return (await fetch(url)).ok;
    } catch {
      return false;
    }
  }
}
