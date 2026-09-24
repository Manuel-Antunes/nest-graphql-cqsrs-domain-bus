import type { Context } from '@opentelemetry/api';
import {
  context as activeContext,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

import type { EnvelopeMetadata } from './outbound/event-envelope';
import type { Ingestion } from './outbound/transport-metadata';
import { CORRELATION_ID } from './request-context';

const TRACER = '@nestposts/transport-eventbus';

/**
 * **The current trace, written onto the envelope** — `traceparent`, and `tracestate` and `baggage`
 * when there are any.
 *
 * It is `@opentelemetry/api` and not an SDK: with nothing registered the propagator is a no-op, the
 * map comes back as it went in, and a deployment that does not collect traces pays a function call.
 * With an SDK registered — see `@nestposts/observability` — the far side's work becomes a child of
 * the request that caused it, across the broker and across the service boundary.
 */
export const injectTraceContext = (
  metadata: Record<string, string>,
): Record<string, string> => {
  propagation.inject(activeContext.active(), metadata);
  return metadata;
};

/** The trace an arriving message belongs to, or the current one when it carries none. */
export const traceContextOf = (metadata: EnvelopeMetadata) =>
  propagation.extract(activeContext.active(), metadata);

/** A trace context written as W3C headers: `traceparent`, and `tracestate`/`baggage` when present. */
export type TraceCarrier = Readonly<Record<string, string>>;

const carriers = new WeakMap<object, TraceCarrier>();

/**
 * **The trace an event was published in, carried with the event** — the way `Tenant.stamp` carries
 * its tenant.
 *
 * An event outlives the request that raised it: it is appended to the log, read back by another
 * container, handed to every subscriber that is listening. By then the context that was active when
 * it was published is long gone, and whatever reacts to it would start a trace of its own. Stamped,
 * the reaction can be a child of the work that caused it — which is how a subscription's delivery of
 * `PostCreated` ends up in the trace of the `createPost` that started it.
 *
 * `TransportEventBusService` stamps what it publishes, the event log stores the stamp beside the
 * event (`trace_context`), and `EventSourcedEventBus` stamps what it reads back.
 */
export class EventTrace {
  /**
   * Records `carrier` — the **active** trace when none is given — as the event's, unless it already
   * has one: the first stamp is where the event was published, and a later one would only be where
   * it passed through.
   */
  static stamp<T extends object>(
    event: T,
    carrier: TraceCarrier | null | undefined = injectTraceContext({}),
  ): T {
    if (carrier && Object.keys(carrier).length > 0 && !carriers.has(event)) {
      carriers.set(event, carrier);
    }
    return event;
  }

  /** The stamp, as the headers it was written as — what the event log stores. */
  static carrierOf(event: object): TraceCarrier | undefined {
    return carriers.get(event);
  }

  /** The stamp, as a context a span can be started in; `undefined` for anything unstamped. */
  static of(event: unknown): Context | undefined {
    const carrier =
      typeof event === 'object' && event !== null
        ? carriers.get(event)
        : undefined;
    return carrier ? propagation.extract(ROOT_CONTEXT, carrier) : undefined;
  }

  /**
   * Gives `to` the stamp `from` has, for what an event becomes on its way out — a view mapped from
   * it, a payload built for a subscriber.
   */
  static carry<T extends object>(from: object, to: T): T {
    return EventTrace.stamp(to, carriers.get(from) ?? null);
  }
}

/**
 * **One span per ingested message, as a child of whatever published it.**
 *
 * This is the span that makes a choreographed saga readable: the mutation in `posts-api`, the
 * publish, and then — under it, in another process — the inbox write, the aggregate's replay and
 * the command the saga dispatched. Without it each service traces its own half and the two halves
 * are two traces that happen to share a correlation id.
 *
 * It wraps the **whole** ingestion — the transaction, the local bus, and the **unit of work**, which
 * is the part that matters here. What this service publishes in reaction is staged while the handler
 * runs and only leaves at the unit's `commit()`, so a span that ended before the commit left every
 * outgoing message without a `traceparent`. See `EventIngestion.ingest` for the order.
 */
export const ingesting = async <T>(
  message: Ingestion,
  run: () => Promise<T>,
): Promise<T> =>
  trace.getTracer(TRACER).startActiveSpan(
    `${message.messageType || 'message'} process`,
    {
      kind: SpanKind.CONSUMER,
      attributes: {
        'messaging.system': TRACER,
        'messaging.operation': 'process',
        'messaging.message.id': message.identifier,
        'messaging.message.conversation_id': message.metadata[CORRELATION_ID],
        'messaging.message.type': message.messageType,
        'messaging.source.origin': message.origin,
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
