import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { print } from 'graphql';
import type { Client } from 'graphql-sse';
import { createClient } from 'graphql-sse';

export class SseSubscription<TResult> {
  readonly received: TResult[] = [];

  private unsubscribe: () => void = () => undefined;

  private constructor(private readonly client: Client) {}

  static open<TResult, TVariables>(
    url: string,
    document: TypedDocumentNode<TResult, TVariables>,
    variables: TVariables,
  ): SseSubscription<TResult> {
    const subscription = new SseSubscription<TResult>(
      createClient({ url, retryAttempts: 0 }),
    );
    subscription.listen(print(document), variables);
    return subscription;
  }

  async close(): Promise<void> {
    this.unsubscribe();
    await this.client.dispose();
  }

  private listen<TVariables>(query: string, variables: TVariables): void {
    this.unsubscribe = this.client.subscribe<TResult>(
      { query, variables: variables as Record<string, unknown> },
      {
        next: ({ data }) => {
          if (data) {
            this.received.push(data);
          }
        },
        error: () => undefined,
        complete: () => undefined,
      },
    );
  }
}
