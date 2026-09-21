import { RmqRecordBuilder, type ReadPacket } from '@nestjs/microservices';
import type { EventEnvelope } from '../event-envelope';
import { EventEnvelopeSerializer } from './event-envelope.serializer';

/**
 * **The envelope on RabbitMQ: the event in the body, the metadata in the AMQP headers.**
 *
 * It builds the message with the transporter's own record API —
 * [`RmqRecordBuilder`](https://docs.nestjs.com/microservices/rabbitmq#record-builders) — and returns
 * what `ClientRMQ` expects of a serializer: `data` becomes the published content, and `options` are
 * the publish options it merges (`headers` among them). That mapping is the one
 * `RmqRecordSerializer` does; it is written out here because the class is not exported from the
 * package root, and because being able to see it is worth three lines.
 *
 * ## Why the metadata belongs in headers
 * Because the body is then **the event**, readable as itself: a management UI, a shovel, a
 * dead-letter queue or `rabbitmqadmin get` shows the fields the application sent instead of a wrapper
 * around them. And routing facts — who sent it, what it is called, which aggregate it is about — are
 * exactly what a broker expects to find in headers, which is also where a future header exchange, a
 * filter or a dead-letter policy would read them.
 */
export class RmqEventEnvelopeSerializer extends EventEnvelopeSerializer {
  protected serializeEnvelope(
    envelope: EventEnvelope<Record<string, unknown>>,
    packet: ReadPacket,
  ): unknown {
    const record = new RmqRecordBuilder(envelope.data)
      .setOptions({ headers: { ...envelope.metadata } })
      .build();

    return { pattern: packet.pattern, data: record.data, options: record.options };
  }
}
