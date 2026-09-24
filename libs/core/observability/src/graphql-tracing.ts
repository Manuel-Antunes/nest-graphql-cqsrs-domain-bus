import type { Attributes, Context, Span } from '@opentelemetry/api';
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import type {
  DocumentNode,
  ExecutionResult,
  GraphQLField,
  GraphQLFieldResolver,
  GraphQLResolveInfo,
  GraphQLSchema,
} from 'graphql';
import {
  defaultFieldResolver,
  getOperationAST,
  Kind,
  print,
  responsePathAsArray,
  visit,
} from 'graphql';
import type { Plugin } from 'graphql-yoga';

const TRACER = '@nestposts/observability/graphql';

const TRACED = Symbol('graphql-tracing');

export interface GraphQLTracingOptions {
  /**
   * A span per call of a resolver the schema declares, nested under its parent field's — which is
   * where a resolver's database queries and outbound calls end up. Fields answered by the default
   * resolver never get one. `false` for a schema whose every field has a resolver that only proxies,
   * which is what a stitched gateway is.
   */
  readonly resolvers?: boolean;
  /**
   * **Where a subscription event came from**, given the payload its stream yielded: the context of
   * the work that produced it. The span that delivers the event becomes a child of that context, so
   * the delivery shows up in the trace of the request that caused it and not only in the trace of
   * the subscription that happened to be listening.
   */
  readonly originOf?: (payload: unknown) => Context | undefined;
}

interface OperationState {
  readonly span: Span;
  readonly events: Span[];
  label?: string;
  attributes?: Attributes;
}

type Resolver = GraphQLFieldResolver<unknown, unknown> & {
  [TRACED]?: true;
};

const MASKED = { kind: Kind.ENUM, value: '*' } as const;

const masked = new WeakMap<DocumentNode, string>();

/**
 * The document as the server received it, with every literal replaced by `*`: an operation written
 * with inline values would otherwise put whatever a caller typed — an email, a token — into every
 * span that describes it. Variables are never recorded.
 */
const documentOf = (document: DocumentNode): string => {
  let printed = masked.get(document);
  if (printed === undefined) {
    printed = print(
      visit(document, {
        IntValue: () => MASKED,
        FloatValue: () => MASKED,
        StringValue: () => MASKED,
        BooleanValue: () => MASKED,
      }),
    );
    masked.set(document, printed);
  }
  return printed;
};

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | undefined)?.then === 'function';

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  typeof (value as AsyncIterable<unknown> | undefined)?.[
    Symbol.asyncIterator
  ] === 'function';

/**
 * Runs `work` and calls `done` once it is over — at once for a value, when it settles for a promise —
 * without turning a synchronous phase into an asynchronous one.
 */
const settle = <T>(work: () => T, done: (failure?: unknown) => void): T => {
  let result: T;
  try {
    result = work();
  } catch (failure) {
    done(failure);
    throw failure;
  }
  if (!isPromiseLike(result)) {
    done();
    return result;
  }
  return Promise.resolve(result).then(
    (value) => {
      done();
      return value;
    },
    (failure: unknown) => {
      done(failure);
      throw failure;
    },
  ) as T;
};

const failed = (span: Span, failure: unknown): void => {
  const error = failure instanceof Error ? failure : new Error(String(failure));
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
};

const failures = (span: Span, result: ExecutionResult | undefined): void => {
  const errors = result?.errors ?? [];
  if (errors.length === 0) {
    return;
  }
  span.setAttribute('graphql.error.count', errors.length);
  for (const error of errors) {
    const code = error.extensions?.code;
    span.addEvent('exception', {
      'exception.type': typeof code === 'string' ? code : 'GraphQLError',
      'exception.message': error.message,
      ...(error.path && { 'graphql.error.path': error.path.join('.') }),
    });
  }
  span.setStatus({ code: SpanStatusCode.ERROR, message: errors[0].message });
};

/**
 * The fields of a type that has them, found by shape rather than with `isObjectType`: that is an
 * `instanceof`, and a schema built by another copy of `graphql` — Nest's CommonJS one beside this
 * module's ESM one, under Vitest — would have no fields at all.
 */
const fieldsOf = (type: unknown): GraphQLField<unknown, unknown>[] =>
  typeof (type as { getFields?: unknown }).getFields === 'function'
    ? Object.values(
        (
          type as {
            getFields(): Record<string, GraphQLField<unknown, unknown>>;
          }
        ).getFields(),
      )
    : [];

const pathOf = (path: GraphQLResolveInfo['path'] | undefined): string =>
  path ? responsePathAsArray(path).join('.') : '';

/**
 * **GraphQL, traced from inside the server** — a Yoga plugin, because Yoga is what executes.
 *
 * `@opentelemetry/instrumentation-graphql` patches `graphql-js`'s `execute` as it is required, and
 * neither half of that holds here: Yoga executes with `@graphql-tools/executor`, not with
 * `graphql-js`'s `execute`, so that instrumentation sees a parse and a validate and never an
 * execution; and on Lambda `graphql` is bundled, so it sees nothing at all. A plugin is called by
 * the server itself, bundled or not.
 *
 * What it records, following OpenTelemetry's GraphQL conventions:
 *
 * ```
 * mutation CreatePost                 graphql.operation.{type,name}, graphql.document (literals masked)
 * ├── graphql.parse
 * ├── graphql.validate
 * └── graphql.execute
 *     └── Mutation.createPost         a resolver the schema declares, and what it did: pg, SNS…
 *         └── Post.tags               nested by response path, not by call stack
 * ```
 *
 * Each phase runs **inside** its span, so the spans an instrumentation opens underneath — a query,
 * an HTTP call to a subgraph — are its children. A result with errors marks the operation as failed
 * and records each error with its path and `extensions.code`.
 *
 * ## A subscription event is delivered in the trace that produced it
 * The operation span of a subscription ends when the stream is set up. Each event it delivers gets a
 * span of its own, `subscription OnPostCreated event`, a **child** of whatever {@link
 * GraphQLTracingOptions.originOf} says produced it and **linked** to the subscription — so the
 * delivery is in the trace of the mutation that caused it, and the subscription is one click away.
 * The event's result then carries that span's `traceparent` in its `extensions`, which is how a
 * gateway in front of this server carries the same trace one hop further.
 *
 * With no SDK registered every span is a no-op and the `extensions` stay empty.
 */
export const useGraphQLTracing = (
  options: GraphQLTracingOptions = {},
): Plugin => {
  const tracer = trace.getTracer(TRACER);
  const operations = new WeakMap<object, OperationState>();
  const fields = new WeakMap<object, Map<string, Context>>();

  const phase = <T>(name: string, wrapped: () => T): T =>
    tracer.startActiveSpan(name, { kind: SpanKind.INTERNAL }, (span) =>
      settle(wrapped, (failure) => {
        if (failure) failed(span, failure);
        span.end();
      }),
    );

  const describe = (args: {
    document: DocumentNode;
    operationName?: string | null;
    contextValue?: unknown;
  }): OperationState | undefined => {
    const operation = operations.get(args.contextValue as object);
    if (!operation) {
      return undefined;
    }
    const definition = getOperationAST(
      args.document,
      args.operationName ?? undefined,
    );
    const type = definition?.operation ?? 'query';
    const name = definition?.name?.value;
    operation.label = name ? `${type} ${name}` : type;
    operation.attributes = {
      'graphql.operation.type': type,
      ...(name && { 'graphql.operation.name': name }),
    };
    operation.span.updateName(operation.label);
    operation.span.setAttributes({
      ...operation.attributes,
      'graphql.document': documentOf(args.document),
    });
    return operation;
  };

  const scopeOf = (
    graphqlContext: unknown,
    info: GraphQLResolveInfo,
  ): object =>
    info.operation.operation === 'subscription' &&
    typeof info.rootValue === 'object' &&
    info.rootValue !== null
      ? info.rootValue
      : (graphqlContext as object);

  const remember = (scope: object, path: string, active: Context): void => {
    let spans = fields.get(scope);
    if (!spans) {
      spans = new Map();
      fields.set(scope, spans);
    }
    spans.set(path, active);
  };

  const parentOf = (scope: object, info: GraphQLResolveInfo): Context => {
    const spans = fields.get(scope);
    for (let at = info.path.prev; spans && at; at = at.prev) {
      const found = spans.get(pathOf(at));
      if (found) return found;
    }
    return context.active();
  };

  const resolver = (resolve: Resolver): Resolver => {
    const traced: Resolver = function (this: unknown, root, args, ctx, info) {
      const scope = scopeOf(ctx, info);
      const parent = parentOf(scope, info);
      const span = tracer.startSpan(
        `${info.parentType.name}.${info.fieldName}`,
        {
          kind: SpanKind.INTERNAL,
          attributes: {
            'graphql.field.name': info.fieldName,
            'graphql.field.path': pathOf(info.path),
            'graphql.field.type': String(info.returnType),
            'graphql.parent.type': info.parentType.name,
          },
        },
        parent,
      );
      const active = trace.setSpan(parent, span);
      remember(scope, pathOf(info.path), active);
      return settle(
        () =>
          context.with(active, () => resolve.call(this, root, args, ctx, info)),
        (failure) => {
          if (failure) failed(span, failure);
          span.end();
        },
      );
    };
    traced[TRACED] = true;
    return traced;
  };

  const delivery = (resolve: Resolver): Resolver => {
    const traced: Resolver = function (
      this: unknown,
      payload,
      args,
      ctx,
      info,
    ) {
      const operation = operations.get(ctx as object);
      const parent = options.originOf?.(payload) ?? context.active();
      const span = tracer.startSpan(
        `${operation?.label ?? 'subscription'} event`,
        {
          kind: SpanKind.CONSUMER,
          attributes: {
            ...operation?.attributes,
            'graphql.field.name': info.fieldName,
          },
          links: operation ? [{ context: operation.span.spanContext() }] : [],
        },
        parent,
      );
      operation?.events.push(span);
      const active = trace.setSpan(parent, span);
      remember(scopeOf(ctx, info), pathOf(info.path), active);
      return settle(
        () =>
          context.with(active, () =>
            resolve.call(this, payload, args, ctx, info),
          ),
        (failure) => {
          if (failure) failed(span, failure);
          if (!operation) span.end();
        },
      );
    };
    traced[TRACED] = true;
    return traced;
  };

  const instrument = (schema: GraphQLSchema): void => {
    const subscription = schema.getSubscriptionType();
    for (const type of Object.values(schema.getTypeMap())) {
      if (type.name.startsWith('__')) {
        continue;
      }
      for (const field of fieldsOf(type)) {
        const resolve = field.resolve as Resolver | undefined;
        if (resolve?.[TRACED]) {
          continue;
        }
        if (type === subscription) {
          field.resolve = delivery(resolve ?? defaultFieldResolver);
        } else if (options.resolvers !== false && resolve) {
          field.resolve = resolver(resolve);
        }
      }
    }
  };

  const delivered = (span: Span, result: ExecutionResult): ExecutionResult => {
    failures(span, result);
    const carrier: Record<string, string> = {};
    propagation.inject(trace.setSpan(context.active(), span), carrier);
    span.end();
    return Object.keys(carrier).length === 0
      ? result
      : { ...result, extensions: { ...result.extensions, ...carrier } };
  };

  return {
    instrumentation: {
      operation: ({ context: graphqlContext }, wrapped) => {
        const span = tracer.startSpan('graphql.operation', {
          kind: SpanKind.INTERNAL,
        });
        operations.set(graphqlContext, { span, events: [] });
        return settle(
          () => context.with(trace.setSpan(context.active(), span), wrapped),
          (failure) => {
            if (failure) failed(span, failure);
            span.end();
          },
        );
      },
      parse: (_, wrapped) => phase('graphql.parse', wrapped),
      validate: (_, wrapped) => phase('graphql.validate', wrapped),
      execute: (_, wrapped) => phase('graphql.execute', wrapped),
      subscribe: (_, wrapped) => phase('graphql.subscribe', wrapped),
    },
    onSchemaChange: ({ schema }) => instrument(schema),
    onExecute: ({ args }) => {
      const operation = describe(args);
      return {
        onExecuteDone: ({ result }) => {
          if (operation && !isAsyncIterable(result)) {
            failures(operation.span, result);
          }
        },
      };
    },
    onSubscribe: ({ args }) => {
      const operation = describe(args);
      return {
        onSubscribeResult: ({ result }) => {
          if (!operation || !isAsyncIterable(result)) {
            if (operation) failures(operation.span, result as ExecutionResult);
            return undefined;
          }
          return {
            onNext: ({ result: next, setResult }) => {
              const span = operation.events.shift();
              if (span) setResult(delivered(span, next));
            },
            onEnd: () => {
              for (const span of operation.events.splice(0)) span.end();
            },
          };
        },
      };
    },
  };
};
