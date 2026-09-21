import type { ProducerSerializer, ReadPacket } from '@nestjs/microservices';
import type { EventEnvelope } from '../event-envelope';

/**
 * **Where the envelope meets a transport.** One implementation per transport, and the only thing each
 * one decides is *where the two halves go*: the body and, if the transport has them, the headers.
 *
 * This is `@nestjs/microservices`' own extension point for "what actually goes on the wire", so the
 * forwarder never learns a protocol: it emits an {@link EventEnvelope} and the client it emits on
 * hands the packet to whatever serializer its options declare.
 *
 * ```ts
 * ClientProxyFactory.create({
 *   transport: Transport.RMQ,
 *   options: { urls, exchange, wildcards: true, serializer: new RmqEventEnvelopeSerializer() },
 * });
 * ```
 *
 * The body is encoded here, once, for every transport: {@link EventEnvelope.encoded} turns the event's
 * `Date`s into something JSON keeps. What is left — a map of strings and a plain object — is what
 * every transporter can carry natively.
 */
export abstract class EventEnvelopeSerializer implements ProducerSerializer {
  serialize(packet: ReadPacket): unknown {
    const envelope = packet.data as EventEnvelope<object>;
    return this.serializeEnvelope(envelope.encoded(), packet);
  }

  /**
   * @param envelope the event's fields, ready for JSON, and the metadata as strings
   * @param packet what Nest is about to send, whose `pattern` is the transport's address
   */
  protected abstract serializeEnvelope(
    envelope: EventEnvelope<Record<string, unknown>>,
    packet: ReadPacket,
  ): unknown;
}
