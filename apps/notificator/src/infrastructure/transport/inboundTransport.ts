import { MemoryServer } from '@camcima/nestjs-memory-microservices';
import type { HttpServer } from '@nestjs/common';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { SqsStrategy } from '@nestposts/microservices-aws';
import { InngestStrategy } from '@nestposts/microservices-inngest';
import {
  InngestEventEnvelopeDeserializer,
  inngestTriggers,
  RmqEventEnvelopeDeserializer,
  SqsEventEnvelopeDeserializer,
} from '@nestposts/transport-eventbus';

import {
  EXCHANGE,
  INBOUND_QUEUE,
  INBOUND_QUEUE_URLS,
  inboundRetryTopology,
  inngest,
  NOTIFICATION_MAX_RETRIES,
  transportMode,
  urls,
} from './transport.config';

export const inboundTransport = (
  httpAdapter?: HttpServer,
): MicroserviceOptions => {
  switch (transportMode()) {
    case 'inngest':
      return {
        strategy: new InngestStrategy({
          inngest: inngest(),
          deserializer: new InngestEventEnvelopeDeserializer(),
          triggers: inngestTriggers,
          retries: NOTIFICATION_MAX_RETRIES,
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
          queueOptions: inboundRetryTopology().queueOptions(),
          exchange: EXCHANGE,
          exchangeType: 'topic',
          wildcards: true,
          noAck: false,
          deserializer: new RmqEventEnvelopeDeserializer(),
        },
      };
  }
};
