import type { EnvelopeMetadata } from '../../outbound/event-envelope';
import { EventEnvelope } from '../../outbound/event-envelope';
import type { IncomingEnvelope } from './event-envelope.deserializer';
import { EventEnvelopeDeserializer } from './event-envelope.deserializer';

/**
 * **The Inngest half of the wire**: the data came in `data`, the metadata in `user`.
 *
 * The pattern falls back to the channel it was delivered on, which is the **bound** pattern the
 * function was created for (`posts.#`), not the event's name — a function is the binding here, the
 * way a queue is on RabbitMQ, and the concrete class comes from the message type in the metadata.
 */
export class InngestEventEnvelopeDeserializer extends EventEnvelopeDeserializer {
  deserializeEnvelope(
    value: unknown,
    options?: Record<string, unknown>,
  ): IncomingEnvelope {
    const event = (value ?? {}) as {
      name?: unknown;
      data?: Record<string, unknown>;
      user?: EnvelopeMetadata;
    };

    return {
      pattern: String(options?.channel ?? event.name ?? ''),
      envelope: new EventEnvelope(event.data ?? {}, event.user ?? {}),
    };
  }
}
