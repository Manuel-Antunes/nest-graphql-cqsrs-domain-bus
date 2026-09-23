import type {
  ConsumerDeserializer,
  IncomingEvent,
} from '@nestjs/microservices';

import type { EventEnvelope } from '../../outbound/event-envelope';

/** What a transport's deserializer has to find in a delivery: the envelope, and what it arrived as. */
export interface IncomingEnvelope {
  readonly pattern: string;
  readonly envelope: EventEnvelope;
}

/**
 * **A delivery becomes an {@link EventEnvelope} again** — one implementation per transport, and the
 * mirror of {@link EventEnvelopeSerializer}.
 *
 * Each transport delivers the two halves differently: RabbitMQ hands the body to the deserializer and
 * the AMQP properties beside it, the in-process one carries both in the value. `deserializeEnvelope`
 * is where that difference lives, and it is the only thing a new transport has to write.
 *
 * ```ts
 * NestFactory.createMicroservice(AppModule, {
 *   transport: Transport.RMQ,
 *   options: { urls, queue, exchange, wildcards: true, deserializer: new RmqEventEnvelopeDeserializer() },
 * });
 * ```
 *
 * What comes out is the envelope, **not** the event: rebuilding the class is the application layer's
 * step and it belongs to `@TransportEvent()`, which is a pipe and can therefore be composed with
 * whatever else a controller wants done to its payload. A deserializer runs before the container has
 * a request in hand, and keeping it at the wire level is what lets one class serve every controller.
 *
 * The pattern is left exactly as it arrived — on RabbitMQ the routing key — so `@EventPattern` and its
 * wildcards keep matching as the transporter intends.
 */
export abstract class EventEnvelopeDeserializer
  implements ConsumerDeserializer
{
  deserialize(
    value: unknown,
    options?: Record<string, unknown>,
  ): IncomingEvent {
    const { pattern, envelope } = this.deserializeEnvelope(value, options);
    return { pattern, data: envelope.decoded() };
  }

  /**
   * @param value what the transporter delivered: the body, already parsed when the transporter parses it
   * @param options what it delivered beside the body — on RabbitMQ the AMQP properties, headers included
   */
  abstract deserializeEnvelope(
    value: unknown,
    options?: Record<string, unknown>,
  ): IncomingEnvelope;
}
