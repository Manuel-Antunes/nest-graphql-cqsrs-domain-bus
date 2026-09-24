import { context, propagation, trace } from '@opentelemetry/api';
import { node } from '@opentelemetry/sdk-node';

import { EventTrace } from './tracing';

const provider = new node.NodeTracerProvider();
const tracer = trace.getTracer('spec');

const CARRIER = {
  traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
};

describe('EventTrace', () => {
  beforeAll(() => provider.register());

  afterAll(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  it('stamps an event with the trace it is published in', () => {
    const event = { id: 1 };

    const span = tracer.startActiveSpan('publish', (active) => {
      EventTrace.stamp(event);
      active.end();
      return active;
    });

    expect(
      trace.getSpanContext(EventTrace.of(event) ?? context.active()),
    ).toMatchObject({
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
    });
  });

  it('keeps the first stamp, which is where the event was published', () => {
    const event = EventTrace.stamp({ id: 2 }, CARRIER);

    tracer.startActiveSpan('passing through', (active) => {
      EventTrace.stamp(event);
      active.end();
    });

    expect(EventTrace.carrierOf(event)).toEqual(CARRIER);
  });

  it('stamps nothing when nothing is tracing', () => {
    expect(EventTrace.of(EventTrace.stamp({ id: 3 }))).toBeUndefined();
  });

  it('carries a stamp onto what the event becomes', () => {
    const view = EventTrace.carry(EventTrace.stamp({ id: 4 }, CARRIER), {});

    expect(EventTrace.carrierOf(view)).toEqual(CARRIER);
  });

  it('answers undefined for anything that is not a stamped object', () => {
    expect(EventTrace.of('a string')).toBeUndefined();
    expect(EventTrace.of(null)).toBeUndefined();
    expect(EventTrace.of({})).toBeUndefined();
  });
});
