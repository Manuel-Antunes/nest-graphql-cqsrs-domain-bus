import { Resolver } from 'node:dns/promises';
import { request } from 'node:https';
import type { LookupFunction } from 'node:net';
import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer, Wait } from 'testcontainers';

import { TestEnvironment } from './test-environment';

const NGROK_IMAGE = 'ngrok/ngrok:latest';
const CLOUDFLARED_IMAGE = 'cloudflare/cloudflared:latest';
const NGROK_URL = /url=(https:\/\/\S+)/;
const CLOUDFLARE_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const PUBLIC_RESOLVERS = ['1.1.1.1', '8.8.8.8'];
const CLOUDFLARE_DNS_SETTLE_MS = 20_000;
const DNS_DEADLINE_MS = 180_000;
const HOST = { host: 'host.docker.internal', ipAddress: 'host-gateway' };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Logs = (line: string) => void;

/**
 * **A public HTTPS address for a port of this machine**, so Polar can deliver webhooks to the web
 * process while the suite runs. It is a container like everything else here, and it reaches the web
 * as `host.docker.internal`, which `host-gateway` maps on Linux as well as on Docker Desktop.
 *
 * **ngrok** when there is an `NGROK_AUTH_TOKEN` (see `TestEnvironment`): the account's own domain,
 * which resolves before the tunnel exists. **A Cloudflare quick tunnel** otherwise — no account, a new
 * `*.trycloudflare.com` name per run — and also when ngrok does not start, which on a free account is
 * what a second agent session anywhere gets. A quick tunnel's name is printed at once and answered by
 * public DNS some tens of seconds later, and asking too early gets an NXDOMAIN that resolvers then
 * cache: the first question waits, and every question goes to a public resolver.
 */
export class Tunnel {
  private constructor(
    private readonly container: StartedTestContainer,
    readonly url: string,
  ) {}

  static async open(port: number, logs: Logs): Promise<Tunnel> {
    const token = TestEnvironment.read('NGROK_AUTH_TOKEN');
    if (token) {
      try {
        return await Tunnel.ngrok(port, token, logs);
      } catch (failure) {
        logs(
          `tunnel: ngrok did not start (${failure instanceof Error ? failure.message : failure}), opening a Cloudflare quick tunnel\n`,
        );
      }
    }
    return Tunnel.cloudflare(port, logs);
  }

  /** What the far side answers a POST to `path` with — `0` while nothing answers at all. */
  async statusOf(path: string, body = '{}'): Promise<number> {
    const { hostname } = new URL(this.url);
    const address = await Tunnel.addressOf(hostname);
    if (!address) {
      return 0;
    }
    const lookup: LookupFunction = (_host, options, callback) =>
      options.all
        ? callback(null, [{ address, family: 4 }])
        : callback(null, address, 4);

    return new Promise((resolve) => {
      const outgoing = request(
        {
          host: hostname,
          servername: hostname,
          path,
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          lookup,
          timeout: 15_000,
        },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      outgoing.on('error', () => resolve(0));
      outgoing.on('timeout', () => outgoing.destroy());
      outgoing.end(body);
    });
  }

  async close(): Promise<void> {
    await this.container.stop({ timeout: 5 }).catch(() => undefined);
  }

  private static async ngrok(
    port: number,
    token: string,
    logs: Logs,
  ): Promise<Tunnel> {
    const output: string[] = [];
    const container = await new GenericContainer(NGROK_IMAGE)
      .withCommand([
        'http',
        `http://host.docker.internal:${port}`,
        '--log',
        'stdout',
      ])
      .withEnvironment({ NGROK_AUTHTOKEN: token })
      .withExtraHosts([HOST])
      .withLogConsumer(Tunnel.recording(output, 'ngrok', logs))
      .withWaitStrategy(Wait.forLogMessage(/started tunnel/))
      .withStartupTimeout(60_000)
      .start();
    return Tunnel.opened(container, output.join('').match(NGROK_URL)?.[1], 0);
  }

  private static async cloudflare(port: number, logs: Logs): Promise<Tunnel> {
    const output: string[] = [];
    const container = await new GenericContainer(CLOUDFLARED_IMAGE)
      .withCommand([
        'tunnel',
        '--no-autoupdate',
        '--url',
        `http://host.docker.internal:${port}`,
      ])
      .withExtraHosts([HOST])
      .withLogConsumer(Tunnel.recording(output, 'cloudflared', logs))
      .withWaitStrategy(Wait.forLogMessage(/Registered tunnel connection/))
      .withStartupTimeout(120_000)
      .start();
    return Tunnel.opened(
      container,
      output.join('').match(CLOUDFLARE_URL)?.[0],
      CLOUDFLARE_DNS_SETTLE_MS,
    );
  }

  private static recording(output: string[], name: string, logs: Logs) {
    return (stream: NodeJS.ReadableStream) =>
      stream.on('data', (line: Buffer | string) => {
        output.push(String(line));
        logs(`${name} ${line}`);
      });
  }

  private static async opened(
    container: StartedTestContainer,
    url: string | undefined,
    settle: number,
  ): Promise<Tunnel> {
    if (!url) {
      await container.stop();
      throw new Error('the tunnel started without printing its public URL');
    }
    await pause(settle);
    const { hostname } = new URL(url);
    const deadline = Date.now() + DNS_DEADLINE_MS;
    while (!(await Tunnel.addressOf(hostname))) {
      if (Date.now() > deadline) {
        await container.stop();
        throw new Error(`${hostname} never resolved on public DNS`);
      }
      await pause(3_000);
    }
    return new Tunnel(container, url);
  }

  private static async addressOf(hostname: string): Promise<string | null> {
    const resolver = new Resolver();
    resolver.setServers(PUBLIC_RESOLVERS);
    const [address] = await resolver.resolve4(hostname).catch(() => []);
    return address ?? null;
  }
}
