import { ApolloLink } from '@apollo/client/link';
import { print } from 'graphql';
import type { Client } from 'graphql-sse';
import { createClient } from 'graphql-sse';
import { Observable } from 'rxjs';

import { TenantHeader } from '../tenant';

const CONNECT_DEADLINE_MS = 45_000;

const connections = new EventTarget();

export function onSseConnected(
  operationName: string,
  listener: () => void,
): () => void {
  const handler = (event: Event) => {
    if ((event as CustomEvent<string>).detail === operationName) listener();
  };
  connections.addEventListener('connected', handler);
  return () => connections.removeEventListener('connected', handler);
}

/**
 * Subscriptions over **GraphQL-over-SSE**, which is what the API speaks: the Yoga driver serves them
 * on the same `/graphql` endpoint, to a request that asks for `text/event-stream`.
 *
 * `singleConnection: false` is the mode that matters. The other one reserves a stream with a `PUT`
 * and then attaches operations to it, which needs the same server process to answer every request of
 * that reservation — exactly what a function behind a load balancer cannot promise. One request per
 * subscription is what makes this work on a long-running process and on Lambda alike.
 *
 * It goes straight to the API and not through `/api/graphql`: a Next route handler answers a request,
 * and a subscription is a stream that stays open. The subscriptions here are `@AllowAnonymous`, so
 * there is no session to forward — only the tenant, the active organization's slug, because a
 * subscription only hears what happens in its own tenant.
 */
export class GraphQLSSELink extends ApolloLink {
  private readonly client: Client;

  constructor(url: string) {
    super();
    this.client = createClient({
      url,
      singleConnection: false,
      retryAttempts: 5,
      headers: () => TenantHeader.headers(),
    });
  }

  override request(
    operation: ApolloLink.Operation,
  ): Observable<ApolloLink.Result> {
    return new Observable<ApolloLink.Result>((subscriber) => {
      let connected = false;

      const deadline = setTimeout(() => {
        if (connected) return;
        subscriber.error(
          new Error(
            `O stream não abriu em ${CONNECT_DEADLINE_MS / 1000}s. Veja os logs da posts-api.`,
          ),
        );
      }, CONNECT_DEADLINE_MS);

      const announce = () => {
        if (connected) return;
        connected = true;
        clearTimeout(deadline);
        connections.dispatchEvent(
          new CustomEvent('connected', {
            detail: operation.operationName ?? '',
          }),
        );
      };

      const dispose = this.client.subscribe(
        {
          query: print(operation.query),
          variables: operation.variables,
          operationName: operation.operationName,
          extensions: operation.extensions,
        },
        {
          next: (value) => {
            announce();
            subscriber.next(value as ApolloLink.Result);
          },
          error: (error) => {
            clearTimeout(deadline);
            subscriber.error(error);
          },
          complete: () => {
            clearTimeout(deadline);
            subscriber.complete();
          },
        },
        { connected: announce },
      );

      return () => {
        clearTimeout(deadline);
        dispose();
      };
    });
  }
}
