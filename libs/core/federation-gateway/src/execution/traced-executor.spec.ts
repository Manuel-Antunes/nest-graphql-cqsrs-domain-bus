import type { Context } from '@opentelemetry/api';
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { node, tracing } from '@opentelemetry/sdk-node';
import type { ExecutionResult, GraphQLSchema } from 'graphql';
import { parse } from 'graphql';
import { createClient } from 'graphql-sse';
import type { Plugin } from 'graphql-yoga';
import { createSchema, createYoga } from 'graphql-yoga';

import { composeSupergraphSdl } from '../composition/compose-supergraph';
import type { Listening } from '../testing/listening';
import { listening } from '../testing/listening';
import { StitchedGateway } from './stitched-gateway';
import { subgraphEventOrigin, tracedExecutor } from './traced-executor';

const TYPE_DEFS = `
  type Query {
    post(id: ID!): Post
    broken: String
  }

  type Post {
    id: ID!
    title: String!
  }

  type Subscription {
    onPostCreated: Post!
  }
`;

const SUBGRAPH_SDL = `
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])
  ${TYPE_DEFS.replace('type Post {', 'type Post @key(fields: "id") {')}
`;

const DELIVERED_IN = {
  traceId: '0af7651916cd43dd8448eb211c80319c',
  spanId: 'b7ad6b7169203331',
};

const exporter = new tracing.InMemorySpanExporter();
const provider = new node.NodeTracerProvider({
  spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
});

const deliveredIn: Plugin = {
  onSubscribe: () => ({
    onSubscribeResult: () => ({
      onNext: ({ result, setResult }) =>
        setResult({
          ...result,
          extensions: {
            traceparent: `00-${DELIVERED_IN.traceId}-${DELIVERED_IN.spanId}-01`,
          },
        }),
    }),
  }),
};

const originsSeen: (Context | undefined)[] = [];

const recordingOrigins: Plugin = {
  onSchemaChange: ({ schema }) => {
    const fields = (schema as GraphQLSchema).getSubscriptionType()?.getFields();
    for (const field of Object.values(fields ?? {})) {
      const resolve = field.resolve;
      field.resolve = (payload, args, ctx, info) => {
        originsSeen.push(subgraphEventOrigin(payload));
        return resolve ? resolve(payload, args, ctx, info) : payload;
      };
    }
  },
};

const spans = (name: string) =>
  exporter.getFinishedSpans().filter((span) => span.name === name);

describe('tracedExecutor', () => {
  beforeAll(() => provider.register());

  afterAll(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  beforeEach(() => {
    exporter.reset();
    originsSeen.length = 0;
  });

  it('runs the call inside a client span named after the subgraph', async () => {
    let active: string | undefined;
    const executor = tracedExecutor('posts', () => {
      active = trace.getActiveSpan()?.spanContext().spanId;
      return { data: { post: null } };
    });

    await executor({ document: parse('query Read { post(id: 1) { id } }') });

    const [span] = spans('subgraph posts');
    expect(span.kind).toBe(SpanKind.CLIENT);
    expect(span.attributes).toEqual({
      'graphql.subgraph.name': 'posts',
      'graphql.operation.type': 'query',
      'graphql.operation.name': 'Read',
    });
    expect(active).toBe(span.spanContext().spanId);
  });

  it('marks a call that answered with errors', async () => {
    const executor = tracedExecutor('posts', () =>
      Promise.resolve({
        errors: [{ message: 'nope' }],
      } as unknown as ExecutionResult),
    );

    await executor({ document: parse('{ broken }') });

    const [span] = spans('subgraph posts');
    expect(span.status).toEqual({
      code: SpanStatusCode.ERROR,
      message: 'nope',
    });
    expect(span.attributes['graphql.error.count']).toBe(1);
  });

  it('marks a call that failed outright, and lets the failure through', async () => {
    const executor = tracedExecutor('posts', () =>
      Promise.reject(new Error('connection refused')),
    );

    await expect(executor({ document: parse('{ broken }') })).rejects.toThrow(
      'connection refused',
    );
    expect(spans('subgraph posts')[0].status.code).toBe(SpanStatusCode.ERROR);
  });

  describe('behind a stitched gateway', () => {
    let subgraph: Listening;
    let gateway: Listening;
    const waiting: ((post: { id: string; title: string }) => void)[] = [];

    beforeAll(async () => {
      subgraph = await listening(
        createYoga({
          logging: false,
          maskedErrors: false,
          plugins: [deliveredIn],
          schema: createSchema({
            typeDefs: TYPE_DEFS,
            resolvers: {
              Query: {
                post: (_: unknown, { id }: { id: string }) => ({
                  id,
                  title: `post ${id}`,
                }),
                broken: () => {
                  throw new Error('not today');
                },
              },
              Subscription: {
                onPostCreated: {
                  async *subscribe() {
                    for (;;) {
                      yield {
                        onPostCreated: await new Promise((resolve) =>
                          waiting.push(resolve),
                        ),
                      };
                    }
                  },
                },
              },
            },
          }),
        }),
      );
      gateway = await listening(
        createYoga({
          logging: false,
          maskedErrors: false,
          plugins: [recordingOrigins],
          schema: new StitchedGateway().build(
            composeSupergraphSdl([
              { name: 'demo', url: subgraph.url, sdl: SUBGRAPH_SDL },
            ]),
          ),
        }),
      );
    });

    afterAll(async () => {
      await gateway?.close();
      await subgraph?.close();
    });

    const post = (query: string) =>
      fetch(gateway.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      }).then((response) => response.json());

    it('traces every call the gateway makes to a subgraph', async () => {
      await expect(post('{ post(id: "1") { title } }')).resolves.toEqual({
        data: { post: { title: 'post 1' } },
      });

      const [span] = spans('subgraph demo');
      expect(span.attributes).toMatchObject({
        'graphql.subgraph.name': 'demo',
        'graphql.operation.type': 'query',
      });
    });

    it("remembers the trace a subgraph delivered each event in, for the gateway's own delivery", async () => {
      const client = createClient({
        url: gateway.url,
        fetchFn: fetch,
        retryAttempts: 0,
      });
      const received = new Promise<unknown>((resolve, reject) => {
        const dispose = client.subscribe(
          { query: 'subscription { onPostCreated { title } }' },
          {
            next: (message) => {
              resolve(message.data);
              dispose();
            },
            error: reject,
            complete: () => undefined,
          },
        );
      });
      await vi.waitFor(() => expect(waiting).toHaveLength(1));
      waiting.shift()?.({ id: '9', title: 'nine' });

      await expect(received).resolves.toEqual({
        onPostCreated: { title: 'nine' },
      });
      client.dispose();

      expect(originsSeen).toHaveLength(1);
      expect(trace.getSpanContext(originsSeen[0] as Context)).toMatchObject(
        DELIVERED_IN,
      );
      await vi.waitFor(() => {
        const [span] = spans('subgraph demo');
        expect(span.attributes['graphql.operation.type']).toBe('subscription');
      });
    });
  });
});
