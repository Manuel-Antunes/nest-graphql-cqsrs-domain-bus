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

export interface SubgraphRequest {
  readonly document: DocumentNode;
  readonly operationName?: string;
  readonly context?: unknown;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export type SubgraphExecutor = (
  request: SubgraphRequest,
) =>
  | ExecutionResult
  | AsyncIterable<ExecutionResult>
  | PromiseLike<ExecutionResult | AsyncIterable<ExecutionResult>>;

type Settled = ExecutionResult | AsyncIterable<ExecutionResult>;

export class TracedExecutor {
  private static readonly TRACER = '@nestposts/gateway';
  private static readonly origins = new WeakMap<object, Context>();

  static originOf(payload: unknown): Context | undefined {
    return typeof payload === 'object' && payload !== null
      ? TracedExecutor.origins.get(payload)
      : undefined;
  }

  static wrap(subgraph: string, executor: SubgraphExecutor): SubgraphExecutor {
    return (request) => {
      const span = TracedExecutor.startSpan(subgraph, request);

      const settled = (result: Settled): Settled => {
        if (TracedExecutor.isAsyncIterable(result)) {
          return TracedExecutor.events(result, span);
        }
        TracedExecutor.answered(span, result);
        span.end();
        return result;
      };
      const rejected = (failure: unknown): never => {
        TracedExecutor.failed(span, failure);
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
        : settled(result as Settled);
    };
  }

  private static startSpan(subgraph: string, request: SubgraphRequest): Span {
    const operation = getOperationAST(request.document, request.operationName);
    const name = request.operationName ?? operation?.name?.value;
    return trace
      .getTracer(TracedExecutor.TRACER)
      .startSpan(`subgraph ${subgraph}`, {
        kind: SpanKind.CLIENT,
        attributes: {
          'graphql.subgraph.name': subgraph,
          'graphql.operation.type': operation?.operation ?? 'query',
          ...(name && { 'graphql.operation.name': name }),
        },
      });
  }

  private static isAsyncIterable(
    value: unknown,
  ): value is AsyncIterable<ExecutionResult> {
    return (
      typeof (value as AsyncIterable<unknown> | undefined)?.[
        Symbol.asyncIterator
      ] === 'function'
    );
  }

  private static failed(span: Span, failure: unknown): void {
    const error =
      failure instanceof Error ? failure : new Error(String(failure));
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }

  private static answered(span: Span, result: ExecutionResult): void {
    const errors = result.errors ?? [];
    if (errors.length > 0) {
      span.setAttribute('graphql.error.count', errors.length);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errors[0].message,
      });
    }
  }

  private static remember(result: ExecutionResult): void {
    const origin = propagation.extract(ROOT_CONTEXT, result.extensions ?? {});
    if (!trace.getSpanContext(origin)) {
      return;
    }
    for (const value of Object.values(result.data ?? {})) {
      if (typeof value === 'object' && value !== null) {
        TracedExecutor.origins.set(value, origin);
      }
    }
  }

  private static events(
    stream: AsyncIterable<ExecutionResult>,
    span: Span,
  ): AsyncIterableIterator<ExecutionResult> {
    const iterator = stream[Symbol.asyncIterator]();
    let open = true;
    const close = (failure?: unknown): void => {
      if (!open) return;
      open = false;
      if (failure) TracedExecutor.failed(span, failure);
      span.end();
    };

    return {
      async next() {
        try {
          const step = await iterator.next();
          if (step.done) close();
          else TracedExecutor.remember(step.value);
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
  }
}
