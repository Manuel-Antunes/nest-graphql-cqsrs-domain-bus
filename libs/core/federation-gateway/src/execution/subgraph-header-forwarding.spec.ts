import type { YogaInitialContext } from 'graphql-yoga';
import { createSchema, createYoga } from 'graphql-yoga';

import type { GatewayIdentity } from '../auth/gateway-identity';
import { GatewayTokenVerifier } from '../auth/gateway-identity';
import { composeSupergraphSdl } from '../composition/compose-supergraph';
import type { Listening } from '../testing/listening';
import { listening } from '../testing/listening';
import type { InboundHeaders } from './stitched-gateway';
import { StitchedGateway } from './stitched-gateway';

const SUBGRAPH_SDL = /* GraphQL */ `
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

  type Query {
    whoami: String!
  }
`;

class StubVerifier extends GatewayTokenVerifier {
  identity: GatewayIdentity | null = null;
  calls = 0;

  async verify(): Promise<GatewayIdentity | null> {
    this.calls += 1;
    return this.identity;
  }
}

describe('subgraph header forwarding', () => {
  const verifier = new StubVerifier();
  let received: Record<string, string> = {};
  let subgraph: Listening;
  let gateway: Listening;

  beforeAll(async () => {
    subgraph = await listening(
      createYoga({
        schema: createSchema({
          typeDefs: 'type Query { whoami: String! }',
          resolvers: {
            Query: {
              whoami: (
                _: unknown,
                __: unknown,
                context: YogaInitialContext,
              ) => {
                received = Object.fromEntries(
                  context.request.headers.entries(),
                );
                return 'ok';
              },
            },
          },
        }),
        logging: false,
      }),
    );
    const stitched = new StitchedGateway({
      tokenVerifier: verifier,
      subgraphTokenResolvers: [
        {
          subgraph: 'native',
          resolve: async () => ({ name: 'x-native-token', value: 'n-1' }),
        },
      ],
    });
    gateway = await listening(
      createYoga({
        schema: stitched.build(
          composeSupergraphSdl([
            { name: 'main', url: subgraph.url, sdl: SUBGRAPH_SDL },
          ]),
        ),
        logging: false,
        context: async ({ req }: { req: { headers: InboundHeaders } }) => ({
          subgraphHeaders: (
            await stitched.resolveSubgraphHeaders(req.headers, ['main'])
          ).headers,
        }),
      }),
    );
  });

  afterAll(async () => {
    await gateway?.close();
    await subgraph?.close();
  });

  const callGateway = async (
    headers: Record<string, string>,
    identity: GatewayIdentity | null = null,
  ) => {
    received = {};
    verifier.identity = identity;
    const response = await fetch(gateway.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ query: '{ whoami }' }),
    });
    return response.json();
  };

  it('forwards the caller’s cookie — the call succeeds either way, it would just arrive anonymous', async () => {
    const body = await callGateway({ cookie: 'session=abc' });

    expect(body).toEqual({ data: { whoami: 'ok' } });
    expect(received.cookie).toBe('session=abc');
  });

  it('forwards the bearer and the tenant, and marks the call as the gateway’s', async () => {
    await callGateway({ authorization: 'Bearer t-1', 'x-tenant': 'acme' });

    expect(received.authorization).toBe('Bearer t-1');
    expect(received['x-tenant']).toBe('acme');
    expect(received['x-gateway']).toBe('true');
  });

  it('routes a bearer bound to an organization by that organization when no header names one', async () => {
    await callGateway(
      { authorization: 'Bearer scoped' },
      { scopes: ['read'], organizationSlug: 'mota' },
    );

    expect(received['x-tenant']).toBe('mota');
  });

  it('lets an explicit x-tenant win over the token', async () => {
    await callGateway(
      { authorization: 'Bearer scoped', 'x-tenant': 'acme' },
      { scopes: ['read'], organizationSlug: 'mota' },
    );

    expect(received['x-tenant']).toBe('acme');
  });

  it('sends no tenant for a token bound to no organization', async () => {
    await callGateway({ authorization: 'Bearer plain' }, { scopes: ['read'] });

    expect(received['x-tenant']).toBeUndefined();
  });

  it('verifies the bearer once per request, and not at all without one', async () => {
    verifier.calls = 0;

    await callGateway({ authorization: 'Bearer once' });
    await callGateway({ cookie: 'session=abc' });

    expect(verifier.calls).toBe(1);
  });

  it('files every subgraph’s headers under its name and its join__Graph value, and lets a resolver replace the bearer', async () => {
    const stitched = new StitchedGateway({
      subgraphTokenResolvers: [
        {
          subgraph: 'native-graph',
          resolve: async () => ({ name: 'X-Native-Token', value: 'n-1' }),
        },
      ],
    });

    const { headers } = await stitched.resolveSubgraphHeaders(
      { authorization: 'Bearer t-1', cookie: 'session=abc' },
      ['native-graph', 'main'],
    );

    expect(headers['native-graph']).toBe(headers.NATIVE_GRAPH);
    expect(headers['native-graph']).toEqual({
      'x-gateway': 'true',
      cookie: 'session=abc',
      'x-native-token': 'n-1',
    });
    expect(headers.main.authorization).toBe('Bearer t-1');
  });
});
