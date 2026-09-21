import type { ReadPacket } from '@nestjs/microservices';
import { EventEnvelope } from '../event-envelope';
import { EventEnvelopeSerializer } from './event-envelope.serializer';

/**
 * **The envelope in process: both halves in the body, because there are no headers here.**
 *
 * `MemoryServer` carries a value, not a message, so the two halves travel as the two properties they
 * are — which is what keeps a spec honest about the difference between them: the deserializer on the
 * other side has to find the metadata where this one put it, exactly as the RabbitMQ pair does with
 * its headers.
 */
export class MemoryEventEnvelopeSerializer extends EventEnvelopeSerializer {
  protected serializeEnvelope(
    envelope: EventEnvelope<Record<string, unknown>>,
    packet: ReadPacket,
  ): unknown {
    return { pattern: packet.pattern, data: { data: envelope.data, metadata: envelope.metadata } };
  }
}
