import { RmqRecordBuilder } from '@nestjs/microservices';
import type {
  ClientProxyTransportOptions,
  OutboxEnvelope,
  OutboxMessage,
} from '@nestjs/outbox';
import {
  asMessageAttributes,
  SnsRecordBuilder,
} from '@nestposts/microservices-aws';
import { InngestRecordBuilder } from '@nestposts/microservices-inngest';

import { routingAttributesOf } from '../aws/aws-message';
import { MessageOriginProvider } from '../messaging/correlation';
import { EventAddress } from './event-address';
import type { MessageHeaders } from './message-headers';
import { LEGACY_CORRELATION_ID } from './message-headers';

/** What `ClientProxyTransport`'s `toPacket` answers: the pattern to emit under, and the data. */
export type OutboxPacket = ReturnType<
  NonNullable<ClientProxyTransportOptions['toPacket']>
>;

/**
 * The brokers this library publishes on, as `toPacket` must tell them apart. The process itself is
 * not one of them: a namespace with no transport goes to the outbox's `local` ({@link OutboxRoute}).
 */
export type OutboxPacketKind = 'rabbitmq' | 'aws' | 'inngest';

/** The session Inngest groups a request's runs under: the correlation id. */
export const CORRELATION_SESSION = 'correlation_id';

/**
 * **How an outbox message goes on each transport** — `@nestjs/outbox`'s `ClientProxyTransport`
 * `toPacket`, one per broker.
 *
 * The body is always the `OutboxEnvelope` the relay built: `id`, `topic`, `key`, `headers`,
 * `createdAt`, `payload`. What each packet adds is the transport's own record, the way the package
 * asks for it ("return a transport record as `data` to use broker headers and keys"), so the client's
 * default serializer sends it and nothing of this library sits on the wire path.
 *
 * The message's `topic` is the qualified name, `posts.PostCreated`. A broker that binds by aggregate
 * is sent the routing key instead, `posts.PostCreated.<aggregate>`, read off the message's headers by
 * {@link EventAddress.ofMessage}:
 *
 * | | pattern | record |
 * |---|---|---|
 * | RabbitMQ | the routing key | `RmqRecord`: the headers as AMQP headers, the id as `messageId`, persistent |
 * | SNS | the routing key | `SnsRecord`: the routing facts as message attributes (a filter policy reads nothing else), the message's sequence (its `key`) as FIFO group, the id as deduplication id |
 * | Inngest | the qualified name — a trigger has no wildcards | `InngestRecord`: the id as idempotency key, the correlation id as session |
 * | a client in this process | the routing key | the envelope itself |
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
      pattern: EventAddress.ofMessage(message).routingKey,
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
    const address = EventAddress.ofMessage(message);
    return {
      pattern: address.routingKey,
      data: new SnsRecordBuilder(envelope)
        .setMessageAttributes(
          asMessageAttributes(
            routingAttributesOf(address.routingKey, headersOf(envelope)),
          ),
        )
        .setMessageGroupId(message.key ?? address.orderingKey)
        .setMessageDeduplicationId(envelope.id)
        .build(),
    };
  }

  static inngest(
    message: OutboxMessage,
    envelope: OutboxEnvelope,
  ): OutboxPacket {
    const headers = headersOf(envelope);
    const correlationId =
      headers[MessageOriginProvider.CORRELATION_ID] ??
      headers[LEGACY_CORRELATION_ID];
    const record = new InngestRecordBuilder(envelope).setIdempotencyKey(
      envelope.id,
    );
    return {
      pattern: EventAddress.ofMessage(message).qualifiedName,
      data: (correlationId
        ? record.setSessions({ [CORRELATION_SESSION]: correlationId })
        : record
      ).build(),
    };
  }

  /**
   * **A client in this process** — a suite's `RecordingClient`: the envelope itself, under the routing
   * key a binding is matched against. No application publishes through one: a namespace with no
   * broker goes to the outbox's `local` instead.
   */
  static inProcess(
    message: OutboxMessage,
    envelope: OutboxEnvelope,
  ): OutboxPacket {
    return {
      pattern: EventAddress.ofMessage(message).routingKey,
      data: envelope,
    };
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
