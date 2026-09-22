import type { ReadPacket } from '@nestjs/microservices';
import { type AwsEnvelopeMessage, routingAttributesOf } from '../../aws/aws-message';
import type { EventEnvelope } from '../event-envelope';
import { EventEnvelopeSerializer } from './event-envelope.serializer';

/**
 * **The envelope on SNS and SQS: the event and the metadata in the body, the selection in the message
 * attributes.**
 *
 * ## Why one class for two services
 * Because with **raw message delivery** on a subscription they carry the same string: the queue
 * receives the topic's message unaltered, attributes included. So a fan-out through a topic and a
 * point-to-point send to a queue are the same wire format, read by the same
 * {@link SqsEventEnvelopeDeserializer} — and a consumer neither knows nor needs to know which one it
 * was. (With raw delivery **off** SNS wraps the message in a notification of its own; the
 * deserializer unwraps it rather than letting a subscription's checkbox decide whether the system
 * works.)
 *
 * ## Why the metadata is not one attribute per key, the way RabbitMQ has one header per key
 * SNS and SQS allow **ten** message attributes per message, and the envelope carries more than that
 * as soon as a request has a tenant and a trace: five transport keys, correlation, causation,
 * `x-tenant`, whatever the application's context declares, `traceparent`. A wire format that spent an
 * attribute per key would work until the eleventh was added and then fail at the API, on whichever
 * service happened to add it. So the whole map travels in the body and the **five routing facts** are
 * lifted into attributes, because those are the ones AWS itself has to read: a subscription filters
 * on message attributes and never on the body.
 *
 * The body is still the event: `data` is what the application wrote, and whoever opens the message in
 * the console, in a dead-letter queue or in a redrive reads the fields rather than a wrapper.
 */
export class AwsEventEnvelopeSerializer extends EventEnvelopeSerializer {
  protected serializeEnvelope(
    envelope: EventEnvelope<Record<string, unknown>>,
    packet: ReadPacket,
  ): AwsEnvelopeMessage {
    const pattern = String(packet.pattern);

    return {
      pattern,
      body: { pattern, data: envelope.data, metadata: envelope.metadata },
      attributes: routingAttributesOf(pattern, envelope.metadata),
    };
  }
}
