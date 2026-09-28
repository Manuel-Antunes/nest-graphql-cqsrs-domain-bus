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
import type { MessageHeaders } from '@nestposts/transport-eventbus';
import {
  EventAddress,
  LEGACY_CORRELATION_ID,
  MessageOriginProvider,
  routingAttributesOf,
} from '@nestposts/transport-eventbus';

type ToPacket = NonNullable<ClientProxyTransportOptions['toPacket']>;

export type OutboxPacket = ReturnType<ToPacket>;

export type OutboxPacketKind = 'rabbitmq' | 'aws' | 'inngest';

export class OutboxPackets {
  static readonly CORRELATION_SESSION = 'correlation_id';

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
            routingAttributesOf(
              address.routingKey,
              OutboxPackets.headersOf(envelope),
            ),
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
    const headers = OutboxPackets.headersOf(envelope);
    const correlationId =
      headers[MessageOriginProvider.CORRELATION_ID] ??
      headers[LEGACY_CORRELATION_ID];
    const record = new InngestRecordBuilder(envelope).setIdempotencyKey(
      envelope.id,
    );
    return {
      pattern: EventAddress.ofMessage(message).qualifiedName,
      data: (correlationId
        ? record.setSessions({
            [OutboxPackets.CORRELATION_SESSION]: correlationId,
          })
        : record
      ).build(),
    };
  }

  static for(kind: OutboxPacketKind): ToPacket {
    return OutboxPackets[kind];
  }

  private static headersOf(envelope: OutboxEnvelope): MessageHeaders {
    return (envelope.headers ?? {}) as MessageHeaders;
  }
}
