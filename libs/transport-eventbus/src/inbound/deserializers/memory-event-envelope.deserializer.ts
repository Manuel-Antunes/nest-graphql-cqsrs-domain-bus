import type { EnvelopeMetadata } from '../../outbound/event-envelope';
import { EventEnvelope } from '../../outbound/event-envelope';
import type { IncomingEnvelope } from './event-envelope.deserializer';
import { EventEnvelopeDeserializer } from './event-envelope.deserializer';

/**
 * **The in-process half of the wire**: both halves came in the body, because `MemoryServer` has no
 * headers to carry them.
 *
 * The pattern falls back to the channel it was delivered on, which is the bound pattern
 * ({@link MemoryClient} matches the routing key against it) — the in-process equivalent of a queue
 * knowing which binding a message arrived through.
 */
export class MemoryEventEnvelopeDeserializer extends EventEnvelopeDeserializer {
  deserializeEnvelope(
    value: unknown,
    options?: Record<string, unknown>,
  ): IncomingEnvelope {
    const message = (value ?? {}) as {
      pattern?: unknown;
      data?: { data?: unknown; metadata?: EnvelopeMetadata };
    };
    const body = message.data ?? {};

    return {
      pattern: String(message.pattern ?? options?.channel ?? ''),
      envelope: new EventEnvelope(body.data ?? {}, body.metadata ?? {}),
    };
  }
}
