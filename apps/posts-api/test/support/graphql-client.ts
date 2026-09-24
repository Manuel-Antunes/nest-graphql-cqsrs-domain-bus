import type { INestApplication } from '@nestjs/common';
import type { ExecutionResult } from 'graphql';
import type { Client } from 'graphql-sse';
import { createClient } from 'graphql-sse';

export class GraphqlClient {
  private readonly sse: Client;
  private cookie = '';
  private tenant: string | undefined;

  constructor(
    private readonly url: string,
    private readonly origin: string,
  ) {
    this.sse = createClient({
      url,
      singleConnection: false,
      retryAttempts: 5,
      headers: (): Record<string, string> => this.headers(),
    });
  }

  static async for(app: INestApplication): Promise<GraphqlClient> {
    const origin = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    return new GraphqlClient(`${origin}/graphql`, origin);
  }

  async signUp(
    email: string,
    name: string,
    password = 'senha-super-secreta',
  ): Promise<string> {
    const response = await fetch(`${this.origin}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });
    if (!response.ok) {
      throw new Error(
        `sign-up falhou (${response.status}): ${await response.text()}`,
      );
    }
    this.cookie = (response.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');
    const { user } = (await response.json()) as { user: { id: string } };
    return user.id;
  }

  signOutLocally(): void {
    this.cookie = '';
  }

  inTenant(tenant: string | undefined): this {
    this.tenant = tenant;
    return this;
  }

  async createOrganization(name: string, slug: string): Promise<string> {
    const response = await fetch(
      `${this.origin}/api/auth/organization/create`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: this.cookie },
        body: JSON.stringify({ name, slug }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `organization/create failed (${response.status}): ${await response.text()}`,
      );
    }
    const { id } = (await response.json()) as { id: string };
    return id;
  }

  private headers(): Record<string, string> {
    return {
      ...(this.cookie ? { cookie: this.cookie } : {}),
      ...(this.tenant ? { 'x-tenant': this.tenant } : {}),
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: ExecutionResult is generic, but we don't need to specify the type here
  async execute<T = Record<string, any>>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<ExecutionResult<T>> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.headers() },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as ExecutionResult<T>;
  }

  // biome-ignore lint/suspicious/noExplicitAny: ExecutionResult is generic, but we don't need to specify the type here
  subscribe<T = Record<string, any>>(
    query: string,
    variables?: Record<string, unknown>,
  ): SubscriptionCollector<T> {
    return new SubscriptionCollector<T>(this.sse, query, variables);
  }

  async dispose(): Promise<void> {
    await this.sse.dispose();
  }
}

export class SubscriptionCollector<T> {
  readonly received: T[] = [];
  readonly errors: unknown[] = [];
  private readonly waiters: Array<() => void> = [];
  readonly unsubscribe: () => void;

  constructor(sse: Client, query: string, variables?: Record<string, unknown>) {
    this.unsubscribe = sse.subscribe<T>(
      { query, variables },
      {
        next: (result) => {
          this.received.push(result.data as T);
          this.waiters.splice(0).forEach((wake) => {
            wake();
          });
        },
        error: (error) => this.errors.push(error),
        complete: () => {},
      },
    );
  }

  /**
   * The event this caller is waiting for, whichever position it arrives in.
   *
   * A subscription is a stream of everything the criteria match, and the saga that completes a post
   * is eventual: another case's completion can land on this stream first. Asking for the one that
   * matches is what makes the assertion about the post the test created.
   */
  async waitForMatch(
    matches: (event: T) => boolean,
    timeoutMs = 5000,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.received.find(matches);
      if (found) {
        return found;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `nenhum evento correspondeu em ${timeoutMs}ms: ${JSON.stringify(this.received)}`,
        );
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
  }

  async waitFor(count: number, timeoutMs = 5000): Promise<T[]> {
    const deadline = Date.now() + timeoutMs;
    while (this.received.length < count) {
      if (Date.now() > deadline) {
        throw new Error(
          `esperava ${count} eventos, recebi ${this.received.length}: ${JSON.stringify(this.received)}`,
        );
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
    return this.received;
  }
}

export async function until(
  condition: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('condição não satisfeita a tempo');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
