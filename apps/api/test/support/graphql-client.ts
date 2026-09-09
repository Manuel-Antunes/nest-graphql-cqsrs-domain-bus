import type { INestApplication } from '@nestjs/common';
import { type Client, createClient, type ExecutionResult } from 'graphql-ws';
import WebSocket from 'ws';

/** Um cliente GraphQL mínimo para os e2e: HTTP para query/mutation, graphql-ws para subscription. */
export class GraphqlClient {
  private readonly ws: Client;

  constructor(private readonly url: string) {
    this.ws = createClient({ url: url.replace(/^http/, 'ws'), webSocketImpl: WebSocket, lazy: false });
  }

  static async for(app: INestApplication): Promise<GraphqlClient> {
    return new GraphqlClient(`${(await app.getUrl()).replace('[::1]', '127.0.0.1')}/graphql`);
  }

  async execute<T = Record<string, any>>(query: string, variables?: Record<string, unknown>): Promise<ExecutionResult<T>> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as ExecutionResult<T>;
  }

  /** Assina e devolve um coletor; `unsubscribe()` fecha a subscription do lado do cliente. */
  subscribe<T = Record<string, any>>(query: string, variables?: Record<string, unknown>): SubscriptionCollector<T> {
    return new SubscriptionCollector<T>(this.ws, query, variables);
  }

  async dispose(): Promise<void> {
    await this.ws.dispose();
  }
}

export class SubscriptionCollector<T> {
  readonly received: T[] = [];
  readonly errors: unknown[] = [];
  private readonly waiters: Array<() => void> = [];
  readonly unsubscribe: () => void;

  constructor(ws: Client, query: string, variables?: Record<string, unknown>) {
    this.unsubscribe = ws.subscribe<T>(
      { query, variables },
      {
        next: (result) => {
          this.received.push(result.data as T);
          this.waiters.splice(0).forEach((wake) => wake());
        },
        error: (error) => this.errors.push(error),
        complete: () => {},
      },
    );
  }

  /** Espera até ter recebido `count` payloads (ou estoura o timeout). */
  async waitFor(count: number, timeoutMs = 5000): Promise<T[]> {
    const deadline = Date.now() + timeoutMs;
    while (this.received.length < count) {
      if (Date.now() > deadline) {
        throw new Error(`esperava ${count} eventos, recebi ${this.received.length}: ${JSON.stringify(this.received)}`);
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
    return this.received;
  }
}

/** Espera uma condição ficar verdadeira — para sincronizar "a subscription já está registrada no servidor". */
export async function until(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('condição não satisfeita a tempo');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
