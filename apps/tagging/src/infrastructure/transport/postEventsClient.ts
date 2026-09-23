import type { ClientProxy } from '@nestjs/microservices';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { SnsClientProxy } from '@nestposts/microservices-aws';
import { InngestClientProxy } from '@nestposts/microservices-inngest';
import {
  AwsEventEnvelopeSerializer,
  InngestEventEnvelopeSerializer,
  MemoryClient,
  MemoryEventEnvelopeSerializer,
  RmqEventEnvelopeSerializer,
} from '@nestposts/transport-eventbus';

import {
  EVENTS_TOPIC_ARN,
  EXCHANGE,
  inngest,
  transportMode,
  urls,
} from './transport.config';

export const postEventsClient = (): ClientProxy => {
  switch (transportMode()) {
    case 'inngest':
      return new InngestClientProxy({
        inngest: inngest(),
        serializer: new InngestEventEnvelopeSerializer(),
      });
    case 'aws':
      return new SnsClientProxy({
        topicArn: EVENTS_TOPIC_ARN,
        serializer: new AwsEventEnvelopeSerializer(),
      });
    case 'memory':
      return new MemoryClient({
        servers: [],
        serializer: new MemoryEventEnvelopeSerializer(),
      });
    default:
      return ClientProxyFactory.create({
        transport: Transport.RMQ,
        options: {
          urls: urls(),
          exchange: EXCHANGE,
          exchangeType: 'topic',
          wildcards: true,
          persistent: true,
          serializer: new RmqEventEnvelopeSerializer(),
        },
      });
  }
};
