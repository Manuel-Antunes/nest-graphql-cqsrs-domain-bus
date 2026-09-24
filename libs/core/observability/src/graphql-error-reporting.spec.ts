import { context, propagation, trace } from '@opentelemetry/api';
import { node, tracing } from '@opentelemetry/sdk-node';
import type { Event } from '@sentry/nestjs';
import * as Sentry from '@sentry/nestjs';
import { GraphQLError } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';

import { startErrorReporting } from './error-reporting';
import { useGraphQLErrorReporting } from './graphql-error-reporting';
import { useGraphQLTracing } from './graphql-tracing';

const exporter = new tracing.InMemorySpanExporter();
const provider = new node.NodeTracerProvider({
  spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
});
const events: Event[] = [];

const yoga = createYoga({
  logging: false,
  maskedErrors: false,
  plugins: [useGraphQLTracing(), useGraphQLErrorReporting()],
  schema: createSchema({
    typeDefs: `
      type Query {
        post: String
        refused: String
        fine: String
      }
    `,
    resolvers: {
      Query: {
        post: () => {
          throw new TypeError('cannot read the post');
        },
        refused: () => {
          throw new GraphQLError('not today', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        },
        fine: () => 'fine',
      },
    },
  }),
});

const query = async (document: string) => {
  const response = await yoga.fetch('http://yoga/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: document }),
  });
  return response.json();
};

describe('useGraphQLErrorReporting', () => {
  beforeAll(() => {
    provider.register();
    vi.stubEnv('LAMBDA_TASK_ROOT', '/var/task');
    startErrorReporting({
      serviceName: 'posts-api',
      dsn: 'https://public@127.0.0.1:9/1',
    });
    Sentry.getClient()?.on('beforeSendEvent', (event) => events.push(event));
  });

  afterAll(async () => {
    await Sentry.close(0);
    vi.unstubAllEnvs();
    await provider.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  beforeEach(() => {
    events.length = 0;
    exporter.reset();
  });

  it('reports what a resolver threw and nobody answered, before the result leaves', async () => {
    const result = await query('query Feed { post fine }');

    expect(result.data).toEqual({ post: null, fine: 'fine' });
    expect(events).toHaveLength(1);
    expect(events[0].exception?.values?.[0]).toMatchObject({
      type: 'TypeError',
      value: 'cannot read the post',
      mechanism: { handled: false, type: 'auto.graphql.yoga' },
    });
    expect(events[0].contexts?.graphql).toEqual({
      operation: 'Feed',
      path: 'post',
    });
  });

  it("opens the report onto the operation's trace", async () => {
    await query('query Feed { post }');

    const [operation] = exporter
      .getFinishedSpans()
      .filter((span) => span.name === 'query Feed');
    expect(events[0].contexts?.trace?.trace_id).toBe(
      operation.spanContext().traceId,
    );
  });

  it('leaves out an error an exception filter already answered', async () => {
    const result = await query('query Refused { refused }');

    expect(result.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(events).toEqual([]);
  });

  it('leaves out a document that never executed', async () => {
    await query('query Feed { post');

    expect(events).toEqual([]);
  });
});
