import type { Context } from '@opentelemetry/api';
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { node, tracing } from '@opentelemetry/sdk-node';
import { GraphQLError } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';

import type { GraphQLTracingOptions } from './graphql-tracing';
import { useGraphQLTracing } from './graphql-tracing';

interface Post {
  id: string;
  title: string;
}

const exporter = new tracing.InMemorySpanExporter();
const provider = new node.NodeTracerProvider({
  spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
});
const tracer = trace.getTracer('spec');

const origins = new WeakMap<object, Context>();

class Channel<T> {
  private readonly waiting: ((value: IteratorResult<T>) => void)[] = [];
  private readonly queued: T[] = [];

  push(value: T): void {
    const next = this.waiting.shift();
    if (next) next({ value, done: false });
    else this.queued.push(value);
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () =>
        this.queued.length
          ? Promise.resolve({ value: this.queued.shift() as T, done: false })
          : new Promise((resolve) => this.waiting.push(resolve)),
      return: () => Promise.resolve({ value: undefined, done: true }),
    };
  }
}

const serverWith = (options: GraphQLTracingOptions = {}) => {
  const created = new Channel<Post>();
  const yoga = createYoga({
    logging: false,
    maskedErrors: false,
    plugins: [
      useGraphQLTracing({
        originOf: (payload) => origins.get(payload as object),
        ...options,
      }),
    ],
    schema: createSchema({
      typeDefs: `
        type Query {
          posts(first: Int): [Post!]!
          broken: String
        }
        type Post {
          id: ID!
          title: String!
          author: Author!
        }
        type Author {
          name: String!
        }
        type Subscription {
          onPostCreated: Post!
        }
      `,
      resolvers: {
        Query: {
          posts: (_: unknown, { first }: { first: number }) =>
            tracer.startActiveSpan('select posts', async (span) => {
              span.end();
              return [
                { id: '1', title: 'one' },
                { id: '2', title: 'two' },
              ].slice(0, first);
            }),
          broken: () => {
            throw new GraphQLError('not today', {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          },
        },
        Post: {
          author: (post: Post) =>
            tracer.startActiveSpan('select author', async (span) => {
              span.end();
              return { name: `author of ${post.id}` };
            }),
        },
        Subscription: {
          onPostCreated: {
            subscribe: () => created,
            resolve: (payload: Post) => payload,
          },
        },
      },
    }),
  });
  return { yoga, created };
};

const query = async (
  yoga: ReturnType<typeof serverWith>['yoga'],
  document: string,
) => {
  const response = await yoga.fetch('http://yoga/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: document }),
  });
  return response.json();
};

const spans = () => exporter.getFinishedSpans();
const named = (name: string) => spans().filter((span) => span.name === name);
const one = (name: string) => {
  const found = named(name);
  expect(found, name).toHaveLength(1);
  return found[0];
};
const parentOf = (span: tracing.ReadableSpan) => span.parentSpanContext?.spanId;

describe('useGraphQLTracing', () => {
  beforeAll(() => provider.register());

  afterAll(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  beforeEach(() => exporter.reset());

  it('names the operation and runs every phase inside it', async () => {
    const { yoga } = serverWith();

    await query(yoga, 'query Feed { posts(first: 2) { title } }');

    const operation = one('query Feed');
    expect(operation.attributes).toMatchObject({
      'graphql.operation.type': 'query',
      'graphql.operation.name': 'Feed',
    });
    for (const phase of ['graphql.parse', 'graphql.validate']) {
      expect(parentOf(one(phase))).toBe(operation.spanContext().spanId);
    }
    expect(parentOf(one('graphql.execute'))).toBe(
      operation.spanContext().spanId,
    );
  });

  it('records the document with its literals masked', async () => {
    const { yoga } = serverWith();

    await query(yoga, 'query Feed { posts(first: 2) { title } }');

    expect(one('query Feed').attributes['graphql.document']).toContain(
      'posts(first: *)',
    );
  });

  it('nests a resolver under its parent field, and what it does under the resolver', async () => {
    const { yoga } = serverWith();

    await query(
      yoga,
      'query Feed { posts(first: 2) { title author { name } } }',
    );

    const posts = one('Query.posts');
    expect(parentOf(posts)).toBe(one('graphql.execute').spanContext().spanId);
    expect(parentOf(one('select posts'))).toBe(posts.spanContext().spanId);

    const authors = named('Post.author');
    expect(authors).toHaveLength(2);
    for (const author of authors) {
      expect(parentOf(author)).toBe(posts.spanContext().spanId);
    }
    for (const select of named('select author')) {
      expect(authors.map((author) => author.spanContext().spanId)).toContain(
        parentOf(select),
      );
    }
    expect(
      authors.map((span) => span.attributes['graphql.field.path']),
    ).toEqual(expect.arrayContaining(['posts.0.author', 'posts.1.author']));
  });

  it('leaves the fields the default resolver answers alone', async () => {
    const { yoga } = serverWith();

    await query(yoga, 'query Feed { posts(first: 1) { id title } }');

    expect(spans().map((span) => span.name)).not.toContain('Post.title');
  });

  it('marks the resolver and the operation that failed, with the code and the path', async () => {
    const { yoga } = serverWith();

    await query(yoga, 'query Broken { broken }');

    expect(one('Query.broken').status.code).toBe(SpanStatusCode.ERROR);
    const operation = one('query Broken');
    expect(operation.status).toEqual({
      code: SpanStatusCode.ERROR,
      message: 'not today',
    });
    expect(operation.attributes['graphql.error.count']).toBe(1);
    expect(operation.events[0].attributes).toMatchObject({
      'exception.type': 'BAD_USER_INPUT',
      'exception.message': 'not today',
      'graphql.error.path': 'broken',
    });
  });

  it('traces no resolver when told not to', async () => {
    const { yoga } = serverWith({ resolvers: false });

    await query(yoga, 'query Feed { posts(first: 1) { author { name } } }');

    expect(named('Query.posts')).toHaveLength(0);
    expect(named('Post.author')).toHaveLength(0);
    expect(named('query Feed')).toHaveLength(1);
  });

  describe('a subscription', () => {
    const subscribe = async (yoga: ReturnType<typeof serverWith>['yoga']) => {
      const response = await yoga.fetch('http://yoga/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify({
          query:
            'subscription OnPostCreated { onPostCreated { title author { name } } }',
        }),
      });
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const next = async (): Promise<{
        data: unknown;
        extensions?: Record<string, string>;
      }> => {
        for (;;) {
          const event = buffer
            .split('\n\n')
            .find((block) => block.includes('data: {'));
          if (event) {
            buffer = buffer.slice(buffer.indexOf(event) + event.length + 2);
            return JSON.parse(event.slice(event.indexOf('data: ') + 6));
          }
          const { value } = await reader.read();
          buffer += decoder.decode(value);
        }
      };
      return { next, close: () => reader.cancel() };
    };

    const producedBy = (name: string, post: Post): Post => {
      const span = tracer.startSpan(name);
      origins.set(post, trace.setSpan(context.active(), span));
      span.end();
      return post;
    };

    it('delivers each event in the trace that produced it, linked to the subscription', async () => {
      const { yoga, created } = serverWith();
      const stream = await subscribe(yoga);

      created.push(producedBy('createPost', { id: '7', title: 'seven' }));
      const result = await stream.next();
      await stream.close();

      expect(result.data).toEqual({
        onPostCreated: { title: 'seven', author: { name: 'author of 7' } },
      });
      const origin = one('createPost');
      const event = one('subscription OnPostCreated event');
      expect(event.kind).toBe(SpanKind.CONSUMER);
      expect(event.spanContext().traceId).toBe(origin.spanContext().traceId);
      expect(parentOf(event)).toBe(origin.spanContext().spanId);
      expect(event.links[0].context.spanId).toBe(
        one('subscription OnPostCreated').spanContext().spanId,
      );
      expect(parentOf(one('Post.author'))).toBe(event.spanContext().spanId);
    });

    it("hands the event's trace on in the result, for whoever is in front", async () => {
      const { yoga, created } = serverWith();
      const stream = await subscribe(yoga);

      created.push(producedBy('createPost', { id: '8', title: 'eight' }));
      const result = await stream.next();
      await stream.close();

      const event = one('subscription OnPostCreated event').spanContext();
      expect(result.extensions?.traceparent).toBe(
        `00-${event.traceId}-${event.spanId}-01`,
      );
    });

    it('gives every event a span of its own', async () => {
      const { yoga, created } = serverWith();
      const stream = await subscribe(yoga);

      created.push(producedBy('first', { id: '1', title: 'one' }));
      await stream.next();
      created.push(producedBy('second', { id: '2', title: 'two' }));
      await stream.next();
      await stream.close();

      const events = named('subscription OnPostCreated event');
      expect(events.map((event) => parentOf(event))).toEqual([
        one('first').spanContext().spanId,
        one('second').spanContext().spanId,
      ]);
    });
  });
});
