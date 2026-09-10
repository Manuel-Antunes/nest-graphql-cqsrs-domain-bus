import type { INestApplication } from '@nestjs/common';
import { type Client, createClient, type ExecutionResult } from 'graphql-ws';
import WebSocket from 'ws';

/** Um cliente GraphQL mínimo para os e2e: HTTP para query/mutation, graphql-ws para subscription. */
export class GraphqlClient {
  private readonly ws: Client;
  /** O cookie de sessão do Better Auth, depois que alguém autenticou. */
  private cookie = '';

  constructor(
    private readonly url: string,
    private readonly origin: string,
  ) {
    this.ws = createClient({ url: url.replace(/^http/, 'ws'), webSocketImpl: WebSocket, lazy: false });
  }

  static async for(app: INestApplication): Promise<GraphqlClient> {
    const origin = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    return new GraphqlClient(`${origin}/graphql`, origin);
  }

  /**
   * Registra e autentica alguém pelo Better Auth de verdade — `POST /api/auth/sign-up/email` —, e
   * guarda o cookie de sessão para as requisições seguintes. É o que o e2e precisa desde que escrever
   * passou a exigir sessão e papel.
   */
  async signUp(email: string, name: string, password = 'senha-super-secreta'): Promise<string> {
    const response = await fetch(`${this.origin}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });
    if (!response.ok) {
      throw new Error(`sign-up falhou (${response.status}): ${await response.text()}`);
    }
    this.cookie = (response.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');
    // O id da credencial — o que a sessão carrega, e o que a porta da identidade recebe para
    // conceder um papel. Ver `IdentityProvider`.
    const { user } = (await response.json()) as { user: { id: string } };
    return user.id;
  }

  /** Volta a ser anônimo — para provar que rota protegida rejeita quem não autenticou. */
  signOutLocally(): void {
    this.cookie = '';
  }

  async execute<T = Record<string, any>>(query: string, variables?: Record<string, unknown>): Promise<ExecutionResult<T>> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) },
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
