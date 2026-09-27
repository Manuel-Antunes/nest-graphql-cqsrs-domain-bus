import type { Type } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import type { OutboxTransport } from '@nestjs/outbox';
import { ClientProxyTransport } from '@nestjs/outbox';
import { SnsClientProxy } from '@nestposts/microservices-aws';
import { InngestClientProxy } from '@nestposts/microservices-inngest';
import { NOTIFICATIONS_NAMESPACE } from '@nestposts/notifications/domain/notifications.namespace';
import { POSTS_NAMESPACE } from '@nestposts/posts/domain/post/event/posts.namespace';
import { MemoryClient, OutboxPackets } from '@nestposts/transport-eventbus';
import { Inngest } from 'inngest';

import type { AppConfig } from '../../config/app.config';
import { appConfig } from '../../config/app.config';
import type { AwsConfig } from '../../config/aws.config';
import { awsConfig } from '../../config/aws.config';
import type { RabbitmqConfig } from '../../config/rabbitmq.config';
import { rabbitmqConfig } from '../../config/rabbitmq.config';

export class PostEventsClient {
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
    inngestClient: Inngest.Any,
  ): ClientProxy {
    switch (app.transport) {
      case 'inngest':
        return new InngestClientProxy({ inngest: inngestClient });
      case 'aws':
        return new SnsClientProxy({
          topicArn: aws.topicArn,
          clientConfig: aws.client,
        });
      case 'memory':
        return new MemoryClient({ servers: [] });
      default:
        return ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls: rabbitmq.urls,
            exchange: app.exchange,
            exchangeType: 'topic',
            wildcards: true,
            persistent: true,
          },
        });
    }
  }

  static destinations(app: AppConfig): Record<string, Type<OutboxTransport>> {
    const transport = ClientProxyTransport(PostEventsClient, {
      toPacket: OutboxPackets.for(app.transport),
    });
    return {
      [POSTS_NAMESPACE]: transport,
      [NOTIFICATIONS_NAMESPACE]: transport,
    };
  }
}
