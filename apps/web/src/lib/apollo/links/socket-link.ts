import type { Client } from 'graphql-ws';
import { ApolloLink } from '@apollo/client/link';
import { print } from 'graphql';
import { createClient } from 'graphql-ws';
import { Observable } from 'rxjs';

const CONNECT_DEADLINE_MS = 45_000;

const connections = new EventTarget();

export function onSocketConnected(
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
 * Subscriptions over `graphql-ws`, which is what the API speaks.
 *
 * It goes straight to the API and not through `/api/graphql`: a Next route handler answers a request,
 * and a subscription is a socket. The subscriptions here are `@AllowAnonymous`, so there is nothing
 * to forward — a session would have to be handed over some other way.
 */
export class GraphQLSocketLink extends ApolloLink {
  private readonly client: Client;

  constructor(url: string) {
    super();
    this.client = createClient({ url, retryAttempts: 5 });
    this.client.on('connected', () =>
      connections.dispatchEvent(new CustomEvent('connected', { detail: '' })),
    );
  }

  override request(operation: ApolloLink.Operation): Observable<ApolloLink.Result> {
    return new Observable<ApolloLink.Result>((subscriber) => {
      let connected = false;

      const deadline = setTimeout(() => {
        if (connected) return;
        subscriber.error(
          new Error(
            `O socket não abriu em ${CONNECT_DEADLINE_MS / 1000}s. Veja os logs da posts-api.`,
          ),
        );
      }, CONNECT_DEADLINE_MS);

      const announce = () => {
        if (connected) return;
        connected = true;
        clearTimeout(deadline);
        connections.dispatchEvent(
          new CustomEvent('connected', { detail: operation.operationName ?? '' }),
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
      );

      return () => {
        clearTimeout(deadline);
        dispose();
      };
    });
  }
}
