// @vitest-environment node
import { context, propagation, trace } from '@opentelemetry/api';
import { node, tracing } from '@opentelemetry/sdk-node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FlushAtRequestEnd } from './flush-at-request-end';

const REQUEST_CONTEXT = Symbol.for('@next/request-context');

const exporter = new tracing.InMemorySpanExporter();
const provider = new node.NodeTracerProvider({
  spanProcessors: [
    new tracing.BatchSpanProcessor(exporter, { scheduledDelayMillis: 60_000 }),
    new FlushAtRequestEnd(),
  ],
});
const tracer = trace.getTracer('spec');

let awaited: Promise<unknown>[] = [];
const request = {
  waitUntil: (promise: Promise<unknown>) => awaited.push(promise),
};

const exported = () => exporter.getFinishedSpans().map((span) => span.name);

describe('FlushAtRequestEnd', () => {
  beforeAll(() => provider.register());

  afterAll(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  beforeEach(() => {
    exporter.reset();
    awaited = [];
    (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT] = {
      get: () => request,
    };
  });

  it('exports what a request buffered once its root span ends, inside the request', async () => {
    tracer.startActiveSpan('POST /api/graphql', (root) => {
      tracer.startSpan('fetch POST /graphql').end();
      root.end();
    });

    expect(awaited).toHaveLength(1);
    await Promise.all(awaited);

    expect(exported()).toEqual(['fetch POST /graphql', 'POST /api/graphql']);
  });

  it('holds the request open until its root span has ended', async () => {
    const root = tracer.startSpan('RSC GET /feed');
    let settled = false;
    void Promise.all(awaited).then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);

    root.end();
    await Promise.all(awaited);
    expect(exported()).toEqual(['RSC GET /feed']);
  });

  it('asks nothing of a request for a span that is not a root', () => {
    tracer.startActiveSpan('root', (root) => {
      tracer.startSpan('child').end();
      root.end();
    });

    expect(awaited).toHaveLength(1);
  });

  it('leaves the batch alone where there is no request to wait for', () => {
    delete (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT];

    tracer.startSpan('boot').end();

    expect(awaited).toHaveLength(0);
    expect(exported()).toEqual([]);
  });
});
