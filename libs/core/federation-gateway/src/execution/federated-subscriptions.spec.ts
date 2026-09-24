import { createClient } from 'graphql-sse';
import { createSchema, createYoga } from 'graphql-yoga';

import { composeSupergraphSdl } from '../composition/compose-supergraph';
import type { Listening } from '../testing/listening';
import { listening } from '../testing/listening';
import { StitchedGateway } from './stitched-gateway';

const SUBGRAPH_SDL = /* GraphQL */ `
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

  type Query {
    ping: String!
  }

  type Subscription {
    batchProgress(key: String!): String!
  }
`;

describe('federated subscriptions over SSE', () => {
  let subgraph: Listening;
  let gateway: Listening;
  let gatewaySchema: ReturnType<StitchedGateway['build']>;

  beforeAll(async () => {
    subgraph = await listening(
      createYoga({
        schema: createSchema({
          typeDefs: /* GraphQL */ `
            type Query {
              ping: String!
            }
            type Subscription {
              batchProgress(key: String!): String!
            }
          `,
          resolvers: {
            Query: { ping: () => 'pong' },
            Subscription: {
              batchProgress: {
                async *subscribe(_: unknown, { key }: { key: string }) {
                  for (const status of [
                    'PENDING',
                    'IN_PROGRESS',
                    'COMPLETED',
                  ]) {
                    yield { batchProgress: `${key}:${status}` };
                  }
                },
              },
            },
          },
        }),
        logging: false,
      }),
    );
    gatewaySchema = new StitchedGateway().build(
      composeSupergraphSdl([
        { name: 'demo', url: subgraph.url, sdl: SUBGRAPH_SDL },
      ]),
    );
    gateway = await listening(
      createYoga({ schema: gatewaySchema, logging: false }),
    );
  });

  afterAll(async () => {
    await gateway?.close();
    await subgraph?.close();
  });

  it('composes a Subscription root into the gateway schema', () => {
    expect(gatewaySchema.getSubscriptionType()).toBeDefined();
  });

  it('delivers every event of a federated subscription, in order, to a graphql-sse client', async () => {
    const client = createClient({
      url: gateway.url,
      fetchFn: fetch,
      retryAttempts: 0,
    });
    const received: string[] = [];

    await new Promise<void>((resolve, reject) => {
      client.subscribe<{ batchProgress: string }>(
        {
          query: 'subscription P($k: String!) { batchProgress(key: $k) }',
          variables: { k: 'lote-42' },
        },
        {
          next: (message) => {
            if (message.data?.batchProgress) {
              received.push(message.data.batchProgress);
            }
          },
          error: reject,
          complete: resolve,
        },
      );
    });
    client.dispose();

    expect(received).toEqual([
      'lote-42:PENDING',
      'lote-42:IN_PROGRESS',
      'lote-42:COMPLETED',
    ]);
  });

  it('answers ordinary queries through the same schema', async () => {
    const response = await fetch(gateway.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ ping }' }),
    });

    await expect(response.json()).resolves.toEqual({ data: { ping: 'pong' } });
  });
});
