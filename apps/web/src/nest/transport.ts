import 'server-only';

import type { ClientProxy } from '@nestjs/microservices';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { localTopicArn, SnsClientProxy } from '@nestposts/microservices-aws';
import {
  InngestClientProxy,
  inngestApp,
} from '@nestposts/microservices-inngest';
import {
  AwsEventEnvelopeSerializer,
  InngestEventEnvelopeSerializer,
  MemoryClient,
  MemoryEventEnvelopeSerializer,
  RmqEventEnvelopeSerializer,
  TransportIdentity,
} from '@nestposts/transport-eventbus';

export const WEB_EVENTS_CLIENT = 'WEB_EVENTS_CLIENT';

export type WebTransportMode = 'inngest' | 'rabbitmq' | 'memory' | 'aws';

/** Who this server is on the wire — the mark every notification it publishes carries. */
export const webIdentity = (): TransportIdentity =>
  TransportIdentity.named(process.env.WEB_APPLICATION_NAME ?? 'web', {
    publishes: process.env.WEB_PUBLISH_EVENTS !== 'false',
  });

export const webTransportMode = (): WebTransportMode => {
  const declared = process.env.WEB_TRANSPORT;
  return declared === 'memory' || declared === 'aws' || declared === 'rabbitmq'
    ? declared
    : 'inngest';
};

/**
 * Where the notifications Better Auth asks for leave this server: the same bus the services publish
 * on — the Inngest dev server, the exchange, the topic — and never to a service by name.
 */
export const webEventsClient = (): ClientProxy => {
  switch (webTransportMode()) {
    case 'inngest':
      return new InngestClientProxy({
        inngest: inngestApp(process.env.WEB_APPLICATION_NAME ?? 'web'),
        serializer: new InngestEventEnvelopeSerializer(),
      });
    case 'aws':
      return new SnsClientProxy({
        topicArn:
          process.env.WEB_TOPIC_ARN ?? localTopicArn('nestposts-events.fifo'),
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
          urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
          exchange: process.env.WEB_EXCHANGE ?? 'nestposts.events',
          exchangeType: 'topic',
          wildcards: true,
          persistent: true,
          serializer: new RmqEventEnvelopeSerializer(),
        },
      });
  }
};
