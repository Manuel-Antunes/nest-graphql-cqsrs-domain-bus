import type { Context, Span } from '@opentelemetry/api';
import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import type { DocumentNode, ExecutionResult } from 'graphql';
import { getOperationAST } from 'graphql';

const TRACER = '@nestposts/federation-gateway';

/** The part of a subschema executor's request this module reads. */
export interface SubgraphRequest {
  readonly document: DocumentNode;
  readonly operationName?: string;
}

/** A subschema executor: a result, or a stream of them for a subscription. */
export type SubgraphExecutor = (
  request: SubgraphRequest,
) =>
  | ExecutionResult
  | AsyncIterable<ExecutionResult>
  | PromiseLike<ExecutionResult | AsyncIterable<ExecutionResult>>;

const origins = new WeakMap<object, Context>();

/**
 * **Where a subgraph's subscription event came from** — the trace the subgraph delivered it in,
 * read off the event's `extensions.traceparent` — or `undefined` for anything else.
 *
 * It answers for the objects of an event's `data`, which are what the gateway's own execution of
 * that event resolves its root field from. Handed to `useGraphQLTracing({ originOf })`, it makes
 * the gateway's delivery of the event one more span in the same trace: the mutation, the saga, the
 * subgraph's delivery, and then the gateway's.
 */
export const subgraphEventOrigin = (payload: unknown): Context | undefined =>
  typeof payload === 'object' && payload !== null
    ? origins.get(payload)
    : undefined;

const isAsyncIterable = (
  value: unknown,
): value is AsyncIterable<ExecutionResult> =>
  typeof (value as AsyncIterable<unknown> | undefined)?.[
    Symbol.asyncIterator
  ] === 'function';

const failed = (span: Span, failure: unknown): void => {
  const error = failure instanceof Error ? failure : new Error(String(failure));
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
};

const answered = (span: Span, result: ExecutionResult): void => {
  const errors = result.errors ?? [];
  if (errors.length > 0) {
    span.setAttribute('graphql.error.count', errors.length);
    span.setStatus({ code: SpanStatusCode.ERROR, message: errors[0].message });
  }
};

const remember = (result: ExecutionResult): void => {
  const origin = propagation.extract(ROOT_CONTEXT, result.extensions ?? {});
  if (!trace.getSpanContext(origin)) {
    return;
  }
  for (const value of Object.values(result.data ?? {})) {
    if (typeof value === 'object' && value !== null) {
      origins.set(value, origin);
    }
  }
};

/**
 * The events of a subscription, passed through untouched but for {@link remember}, with the span
 * ending when the stream does. A hand-written iterator and not an `async function*`: a generator
 * serializes `return()` behind a pending `next()`, and a client that goes away would leave the
 * subgraph's stream open until its next event.
 */
const events = (
  stream: AsyncIterable<ExecutionResult>,
  span: Span,
): AsyncIterableIterator<ExecutionResult> => {
  const iterator = stream[Symbol.asyncIterator]();
  let open = true;
  const close = (failure?: unknown): void => {
    if (!open) return;
    open = false;
    if (failure) failed(span, failure);
    span.end();
  };

  return {
    async next() {
      try {
        const step = await iterator.next();
        if (step.done) close();
        else remember(step.value);
        return step;
      } catch (failure) {
        close(failure);
        throw failure;
      }
    },
    async return(value?: unknown) {
      close();
      return (
        (await iterator.return?.(value)) ?? {
          value: undefined,
          done: true as const,
        }
      );
    },
    async throw(error?: unknown) {
      close(error);
      if (iterator.throw) return iterator.throw(error);
      throw error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
};

/**
 * **One span per call to a subgraph**, `subgraph posts`, as a client span of whatever the gateway
 * was executing when it made the call.
 *
 * The HTTP request underneath — and the `traceparent` it carries — happens inside it, so the
 * subgraph's own work is its child and the gateway's trace reads as a query plan: which subgraph was
 * asked, for which operation, and how long each took. The document the subgraph received is on the
 * subgraph's own operation span, one level down.
 *
 * A subscription's span lasts as long as its stream, and every event on it is remembered for
 * {@link subgraphEventOrigin}.
 */
export const tracedExecutor =
  (subgraph: string, executor: SubgraphExecutor): SubgraphExecutor =>
  (request) => {
    const operation = getOperationAST(request.document, request.operationName);
    const name = request.operationName ?? operation?.name?.value;
    const span = trace.getTracer(TRACER).startSpan(`subgraph ${subgraph}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'graphql.subgraph.name': subgraph,
        'graphql.operation.type': operation?.operation ?? 'query',
        ...(name && { 'graphql.operation.name': name }),
      },
    });

    const settled = (
      result: ExecutionResult | AsyncIterable<ExecutionResult>,
    ): ExecutionResult | AsyncIterable<ExecutionResult> => {
      if (isAsyncIterable(result)) {
        return events(result, span);
      }
      answered(span, result);
      span.end();
      return result;
    };
    const rejected = (failure: unknown): never => {
      failed(span, failure);
      span.end();
      throw failure;
    };

    let result: ReturnType<SubgraphExecutor>;
    try {
      result = context.with(trace.setSpan(context.active(), span), () =>
        executor(request),
      );
    } catch (failure) {
      return rejected(failure);
    }
    return typeof (result as PromiseLike<unknown>).then === 'function'
      ? Promise.resolve(result).then(settled, rejected)
      : settled(result as ExecutionResult | AsyncIterable<ExecutionResult>);
  };
