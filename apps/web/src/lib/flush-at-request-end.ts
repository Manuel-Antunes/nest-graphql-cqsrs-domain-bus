import { trace } from '@opentelemetry/api';
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

interface RequestContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface RequestContextSource {
  get(): RequestContext | undefined;
}

const REQUEST_CONTEXT = Symbol.for('@next/request-context');

const LONGEST_REQUEST_MS = 30_000;

const currentRequest = (): RequestContext | undefined =>
  (globalThis as { [REQUEST_CONTEXT]?: RequestContextSource })[
    REQUEST_CONTEXT
  ]?.get();

const flushEverything = async (): Promise<void> => {
  const provider = trace.getTracerProvider() as { getDelegate?: () => unknown };
  const delegate = (provider.getDelegate?.() ?? provider) as {
    forceFlush?: () => Promise<void>;
  };
  await delegate.forceFlush?.();
};

export class FlushAtRequestEnd implements SpanProcessor {
  private readonly roots = new Map<string, () => void>();

  onStart(span: Span): void {
    const parent = span.parentSpanContext;
    if (parent && !parent.isRemote) {
      return;
    }
    const request = currentRequest();
    if (!request) {
      return;
    }

    const id = span.spanContext().spanId;
    const ended = new Promise<void>((resolve) => {
      const timer = setTimeout(() => done(), LONGEST_REQUEST_MS);
      const done = () => {
        clearTimeout(timer);
        this.roots.delete(id);
        resolve();
      };
      this.roots.set(id, done);
    });
    request.waitUntil(ended.then(flushEverything).catch(() => undefined));
  }

  onEnd(span: ReadableSpan): void {
    this.roots.get(span.spanContext().spanId)?.();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
