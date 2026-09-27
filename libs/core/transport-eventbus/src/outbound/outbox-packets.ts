import { RmqRecordBuilder } from '@nestjs/microservices';
import type {
  ClientProxyTransportOptions,
  OutboxEnvelope,
  OutboxMessage,
} from '@nestjs/outbox';
import {
  asMessageAttributes,
  orderingKeyIn,
  SnsRecordBuilder,
} from '@nestposts/microservices-aws';
import { InngestRecordBuilder } from '@nestposts/microservices-inngest';
import { qualifiedNameIn } from '@nestposts/platform/domain/shared/event-type';

import { routingAttributesOf } from '../aws/aws-message';
import { CORRELATION_ID } from '../request-context';
import type { MessageHeaders } from './message-headers';
import { TRANSPORT_MESSAGE_TYPE } from './message-headers';

/** What `ClientProxyTransport`'s `toPacket` answers: the pattern to emit under, and the data. */
export type OutboxPacket = ReturnType<
  NonNullable<ClientProxyTransportOptions['toPacket']>
>;

/** The transports this library publishes on, as `toPacket` must tell them apart. */
export type OutboxPacketKind = 'rabbitmq' | 'aws' | 'inngest' | 'memory';

/** The session Inngest groups a request's runs under: the correlation id. */
export const CORRELATION_SESSION = 'correlation_id';

/**
 * **How an outbox message goes on each transport** — `@nestjs/outbox`'s `ClientProxyTransport`
 * `toPacket`, one per broker.
 *
 * The body is always the `OutboxEnvelope` the relay built: `id`, `topic`, `key`, `headers`,
 * `createdAt`, `payload`. What each packet adds is the transport's own record, the way the package
 * asks for it ("return a transport record as `data` to use broker headers and keys"), so the client's
 * default serializer sends it and nothing of this library sits on the wire path:
 *
 * | | pattern | record |
 * |---|---|---|
 * | RabbitMQ | the routing key, `posts.PostCreated.<aggregate>` | `RmqRecord`: the headers as AMQP headers, the id as `messageId`, persistent |
 * | SNS | the routing key | `SnsRecord`: the routing facts as message attributes (a filter policy reads nothing else), the aggregate as FIFO group, the id as deduplication id |
 * | Inngest | the QUALIFIED name, `posts.PostCreated` — a trigger has no wildcards | `InngestRecord`: the id as idempotency key, the correlation id as session |
 * | in process | the routing key | the envelope itself |
 *
 * The consumer reads the envelope back with `@Payload()` on every one of them: the transports' own
 * deserializers already hand over `{ pattern, data }`.
 */
export class OutboxPackets {
  static rabbitmq(
    message: OutboxMessage,
    envelope: OutboxEnvelope,
  ): OutboxPacket {
    return {
      pattern: message.topic,
      data: new RmqRecordBuilder(envelope)
        .setOptions({
          headers: { ...envelope.headers },
          messageId: envelope.id,
          persistent: true,
        })
        .build(),
    };
  }

  static aws(message: OutboxMessage, envelope: OutboxEnvelope): OutboxPacket {
    return {
      pattern: message.topic,
      data: new SnsRecordBuilder(envelope)
        .setMessageAttributes(
          asMessageAttributes(
            routingAttributesOf(message.topic, headersOf(envelope)),
          ),
        )
        .setMessageGroupId(orderingKeyIn(message.topic))
        .setMessageDeduplicationId(envelope.id)
        .build(),
    };
  }

  static inngest(
    message: OutboxMessage,
    envelope: OutboxEnvelope,
  ): OutboxPacket {
    const headers = headersOf(envelope);
    const messageType = headers[TRANSPORT_MESSAGE_TYPE];
    const correlationId = headers[CORRELATION_ID];
    const record = new InngestRecordBuilder(envelope).setIdempotencyKey(
      envelope.id,
    );
    return {
      pattern: messageType ? qualifiedNameIn(messageType) : message.topic,
      data: (correlationId
        ? record.setSessions({ [CORRELATION_SESSION]: correlationId })
        : record
      ).build(),
    };
  }

  static memory(
    message: OutboxMessage,
    envelope: OutboxEnvelope,
  ): OutboxPacket {
    return { pattern: message.topic, data: envelope };
  }

  /** The `toPacket` of a transport, by kind — what a `ClientProxyTransport` is built with. */
  static for(
    kind: OutboxPacketKind,
  ): NonNullable<ClientProxyTransportOptions['toPacket']> {
    return OutboxPackets[kind];
  }
}

const headersOf = (envelope: OutboxEnvelope): MessageHeaders =>
  (envelope.headers ?? {}) as MessageHeaders;
