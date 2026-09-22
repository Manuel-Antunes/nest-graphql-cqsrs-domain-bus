import {
  SpanKind,
  SpanStatusCode,
  context as activeContext,
  propagation,
  trace,
} from '@opentelemetry/api';
import { CORRELATION_ID } from './request-context';
import type { EnvelopeMetadata } from './outbound/event-envelope';
import type { Ingestion } from './outbound/transport-metadata';

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
export const injectTraceContext = (metadata: Record<string, string>): Record<string, string> => {
  propagation.inject(activeContext.active(), metadata);
  return metadata;
};

/** The trace an arriving message belongs to, or the current one when it carries none. */
export const traceContextOf = (metadata: EnvelopeMetadata) =>
  propagation.extract(activeContext.active(), metadata);

/**
 * **One span per ingested message, as a child of whatever published it.**
 *
 * This is the span that makes a choreographed saga readable: the mutation in `posts-api`, the
 * publish, and then — under it, in another process — the inbox write, the aggregate's replay and
 * the command the saga dispatched. Without it each service traces its own half and the two halves
 * are two traces that happen to share a correlation id.
 *
 * It wraps the **whole** ingestion, the transaction included, and ends after the local bus has been
 * published to, so what it measures is what the message cost this service.
 */
export const ingesting = async <T>(message: Ingestion, run: () => Promise<T>): Promise<T> =>
  trace
    .getTracer(TRACER)
    .startActiveSpan(
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
