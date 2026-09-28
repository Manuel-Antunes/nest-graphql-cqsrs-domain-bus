import type { Context } from '@opentelemetry/api';
import {
  context as activeContext,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

import { MessageOriginProvider } from './messaging/correlation';
import { EventMessage } from './messaging/event-message';
import type {
  MessageDispatchInterceptor,
  MessageDispatchInterceptorChain,
} from './messaging/interception';
import type { Message, Metadata } from './messaging/message';
import { isTraceContext } from './outbound/message-headers';
import { originOf } from './outbound/transport-metadata';
import type { ProcessingContext } from './unit-of-work/processing-context';

const TRACER = '@nestposts/transport-eventbus';

/**
 * **The current trace, written into a message's metadata** — `traceparent`, and `tracestate` and
 * `baggage` when there are any.
 *
 * It is `@opentelemetry/api` and not an SDK: with nothing registered the propagator is a no-op, the
 * map comes back as it went in, and a deployment that does not collect traces pays a function call.
 */
export const injectTraceContext = (
  metadata: Record<string, string>,
): Record<string, string> => {
  propagation.inject(activeContext.active(), metadata);
  return metadata;
};

/** The trace an arriving message belongs to, or the current one when it carries none. */
export const traceContextOf = (metadata: Metadata) =>
  propagation.extract(activeContext.active(), metadata);

/** A trace context written as W3C headers: `traceparent`, and `tracestate`/`baggage` when present. */
export type TraceCarrier = Readonly<Record<string, string>>;

const carriers = new WeakMap<object, TraceCarrier>();

const traceIn = (metadata: Metadata): TraceCarrier | undefined => {
  const carrier = Object.fromEntries(
    Object.entries(metadata).filter(([key]) => isTraceContext(key)),
  );
  return Object.keys(carrier).length > 0 ? carrier : undefined;
};

/**
 * **The trace an event was published in, carried with the event.**
 *
 * An event outlives the request that raised it: it is appended to the store, read back by another
 * container, handed to every subscriber that is listening. The trace it was published in is part of
 * its metadata — as in Axon, whose tracing propagates through metadata — so whatever reacts to it can
 * be a child of the work that caused it: that is how a subscription's delivery of `PostCreated` ends
 * up in the trace of the `createPost` that started it.
 *
 * What is not a message — a view mapped from an event, a payload built for a subscriber — carries a
 * stamp of its own, given by {@link carry}.
 */
export class EventTrace {
  /**
   * Records `carrier` — the **active** trace when none is given — as the event's, unless it has one
   * already: the first stamp is where the event was published.
   */
  static stamp<T extends object>(
    event: T,
    carrier: TraceCarrier | null | undefined = injectTraceContext({}),
  ): T {
    if (!carrier || Object.keys(carrier).length === 0) {
      return event;
    }
    const message = EventMessage.attachedTo(event);
    if (message) {
      if (!traceIn(message.metadata)) {
        message.andMetadata(carrier);
      }
      return event;
    }
    if (!carriers.has(event)) {
      carriers.set(event, carrier);
    }
    return event;
  }

  /** The stamp, as the headers it was written as. */
  static carrierOf(event: object): TraceCarrier | undefined {
    const message = EventMessage.attachedTo(event);
    return message ? traceIn(message.metadata) : carriers.get(event);
  }

  /** The stamp, as a context a span can be started in; `undefined` for anything unstamped. */
  static of(event: unknown): Context | undefined {
    const carrier =
      typeof event === 'object' && event !== null
        ? EventTrace.carrierOf(event)
        : undefined;
    return carrier ? propagation.extract(ROOT_CONTEXT, carrier) : undefined;
  }

  /** Gives `to` the stamp `from` has — for what an event becomes on its way out, a view mapped from it. */
  static carry<T extends object>(from: object, to: T): T {
    return EventTrace.stamp(to, EventTrace.carrierOf(from) ?? null);
  }
}

/**
 * **Every message dispatched carries the trace it was dispatched in**, unless it carries one already —
 * an event rebuilt from elsewhere keeps the trace it was published in.
 */
export class TraceContextDispatchInterceptor
  implements MessageDispatchInterceptor
{
  interceptOnDispatch(
    message: Message,
    context: ProcessingContext | undefined,
    chain: MessageDispatchInterceptorChain,
  ): Message {
    return chain.proceed(
      traceIn(message.metadata)
        ? message
        : message.andMetadata(injectTraceContext({})),
      context,
    );
  }
}

/**
 * **One span per delivered message, as a child of whatever published it.**
 *
 * It wraps the delivery's **whole** unit of work, not only the handler: what the unit publishes in
 * reaction is staged while it runs and written to the outbox in `PREPARE_COMMIT`, with the trace that
 * is active then. A span that ended before `PREPARE_COMMIT` would send every outgoing message without
 * a `traceparent`, and the next service would open a trace of its own.
 */
export const ingesting = async <T>(
  message: EventMessage,
  run: () => Promise<T>,
): Promise<T> =>
  trace.getTracer(TRACER).startActiveSpan(
    `${message.type.toString() || 'message'} process`,
    {
      kind: SpanKind.CONSUMER,
      attributes: {
        'messaging.system': TRACER,
        'messaging.operation': 'process',
        'messaging.message.id': message.identifier,
        'messaging.message.conversation_id':
          message.metadata[MessageOriginProvider.CORRELATION_ID],
        'messaging.message.type': message.type.toString(),
        'messaging.source.origin': originOf(message.payload),
      },
    },
    traceContextOf(message.metadata),
    async (span) => {
      try {
        return await run();
      } catch (failure) {
        span.recordException(failure as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: failure instanceof Error ? failure.message : String(failure),
        });
        throw failure;
      } finally {
        span.end();
      }
    },
  );
