import { MemoryServer } from '@camcima/nestjs-memory-microservices';
import type { HttpServer } from '@nestjs/common';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import {
  InngestEventEnvelopeDeserializer,
  InngestStrategy,
  RmqEventEnvelopeDeserializer,
  SqsEventEnvelopeDeserializer,
  SqsStrategy,
} from '@nestposts/transport-eventbus';

import {
  EXCHANGE,
  INBOUND_QUEUE,
  INBOUND_QUEUE_URLS,
  inngest,
  transportMode,
  urls,
} from './transport.config';

/**
 * One queue for this service, bound to the routing keys its controllers declare.
 *
 * A queue per SERVICE is not optional on RabbitMQ: a copy is made per bound queue, not per consumer,
 * so two applications sharing a queue would compete for the messages instead of each receiving one —
 * and whichever discards it acknowledges it, killing it for the other.
 */

export const inboundTransport = (
  httpAdapter?: HttpServer,
): MicroserviceOptions => {
  switch (transportMode()) {
    case 'inngest':
      return {
        strategy: new InngestStrategy({
          inngest: inngest(),
          deserializer: new InngestEventEnvelopeDeserializer(),
          httpAdapter,
        }),
      };
    case 'aws':
      return {
        strategy: new SqsStrategy({
          queueUrl: INBOUND_QUEUE_URLS,
          deserializer: new SqsEventEnvelopeDeserializer(),
        }),
      };
    case 'memory':
      return { strategy: new MemoryServer() };
    default:
      return {
        transport: Transport.RMQ,
        options: {
          urls: urls(),
          queue: INBOUND_QUEUE,
          queueOptions: { durable: true },
          exchange: EXCHANGE,
          exchangeType: 'topic',
          wildcards: true,
          noAck: false,
          deserializer: new RmqEventEnvelopeDeserializer(),
        },
      };
  }
};
