import { MemoryServer } from '@camcima/nestjs-memory-microservices';
import type { HttpServer } from '@nestjs/common';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { SqsStrategy } from '@nestposts/microservices-aws';
import { InngestStrategy } from '@nestposts/microservices-inngest';
import { inngestTriggers } from '@nestposts/transport-eventbus';
import { Inngest } from 'inngest';

import type { AppConfig } from '../../config/app.config';
import { appConfig } from '../../config/app.config';
import type { AwsConfig } from '../../config/aws.config';
import { awsConfig } from '../../config/aws.config';
import type { InngestConfig } from '../../config/inngest.config';
import { inngestConfig } from '../../config/inngest.config';
import type { RabbitmqConfig } from '../../config/rabbitmq.config';
import { rabbitmqConfig } from '../../config/rabbitmq.config';

export class InboundTransport {
  static readonly inject = [
    appConfig.KEY,
    awsConfig.KEY,
    rabbitmqConfig.KEY,
    inngestConfig.KEY,
    Inngest,
  ];

  static options(
    app: AppConfig,
    aws: AwsConfig,
    rabbitmq: RabbitmqConfig,
    inngest: InngestConfig,
    inngestClient: Inngest.Any,
    httpAdapter?: HttpServer,
  ): MicroserviceOptions {
    switch (app.transport) {
      case 'inngest':
        return {
          strategy: new InngestStrategy({
            inngest: inngestClient,
            triggers: inngestTriggers,
            serveOrigin: inngest.serveOrigin,
            httpAdapter,
          }),
        };
      case 'aws':
        return {
          strategy: new SqsStrategy({
            queueUrl: aws.inboundQueueUrl,
            clientConfig: aws.client,
          }),
        };
      case 'memory':
        return { strategy: new MemoryServer() };
      default:
        return {
          transport: Transport.RMQ,
          options: {
            urls: rabbitmq.urls,
            queue: app.inboundQueue,
            queueOptions: { durable: true },
            exchange: app.exchange,
            exchangeType: 'topic',
            wildcards: true,
            noAck: false,
          },
        };
    }
  }

  static lambda(aws: AwsConfig): MicroserviceOptions {
    return {
      strategy: new SqsStrategy({
        clientConfig: aws.client,
      }),
    };
  }
}
