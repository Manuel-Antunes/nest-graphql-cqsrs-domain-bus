import type { EnvelopeMetadata } from '../../outbound/event-envelope';
import type { IncomingEnvelope } from './event-envelope.deserializer';
import { EventEnvelope } from '../../outbound/event-envelope';
import { EventEnvelopeDeserializer } from './event-envelope.deserializer';

/**
 * **The RabbitMQ half of the wire: the body is the event, the AMQP headers are the metadata.**
 *
 * `ServerRMQ` parses the content and hands the deserializer the message's `properties` as its second
 * argument, which is where `headers` are — so the two halves arrive exactly where
 * {@link RmqEventEnvelopeSerializer} put them.
 *
 * **amqplib returns a header's value as a `Buffer`** whenever it was sent as a long string, which is
 * what a string of any length is. Left alone, `metadata['cqrs-transport-origin']` would be a Buffer
 * that never equals this service's name — the origin guard would stop cutting the loop, and every
 * event would come back once per service. Hence the normalisation.
 */
export class RmqEventEnvelopeDeserializer extends EventEnvelopeDeserializer {
  deserializeEnvelope(
    value: unknown,
    options?: Record<string, unknown>,
  ): IncomingEnvelope {
    const message = (value ?? {}) as { pattern?: unknown; data?: unknown };
    const headers = (options?.['headers'] ?? {}) as Record<string, unknown>;

    return {
      pattern: String(message.pattern ?? ''),
      envelope: new EventEnvelope(message.data ?? {}, asStrings(headers)),
    };
  }
}

const asStrings = (headers: Record<string, unknown>): EnvelopeMetadata =>
  Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      Buffer.isBuffer(value) ? value.toString('utf8') : String(value),
    ]),
  );
