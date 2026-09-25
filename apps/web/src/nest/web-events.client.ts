import 'server-only';

import type { ClientProxy } from '@nestjs/microservices';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { SnsClientProxy } from '@nestposts/microservices-aws';
import type { InngestClientProxyOptions } from '@nestposts/microservices-inngest';
import { InngestClientProxy } from '@nestposts/microservices-inngest';
import {
  AwsEventEnvelopeSerializer,
  InngestEventEnvelopeSerializer,
  MemoryClient,
  MemoryEventEnvelopeSerializer,
  RmqEventEnvelopeSerializer,
} from '@nestposts/transport-eventbus';
import { Inngest } from 'inngest';

import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import type { AwsConfig } from './config/aws.config';
import { awsConfig } from './config/aws.config';
import type { RabbitmqConfig } from './config/rabbitmq.config';
import { rabbitmqConfig } from './config/rabbitmq.config';

/**
 * Where the notifications Better Auth asks for leave this server: the same bus the services publish
 * on — the Inngest dev server, the exchange, the topic — and never to a service by name.
 */
export class WebEventsClient {
  static readonly inject = [
    appConfig.KEY,
    awsConfig.KEY,
    rabbitmqConfig.KEY,
    Inngest,
  ];

  static create(
    app: AppConfig,
    aws: AwsConfig,
    rabbitmq: RabbitmqConfig,
    inngestClient: InngestClientProxyOptions['inngest'],
  ): ClientProxy {
    switch (app.transport) {
      case 'inngest':
        return new InngestClientProxy({
          inngest: inngestClient,
          serializer: new InngestEventEnvelopeSerializer(),
        });
      case 'aws':
        return new SnsClientProxy({
          topicArn: aws.topicArn,
          clientConfig: aws.client,
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
            urls: rabbitmq.urls,
            exchange: app.exchange,
            exchangeType: 'topic',
            wildcards: true,
            persistent: true,
            serializer: new RmqEventEnvelopeSerializer(),
          },
        });
    }
  }
}
