import { InngestExceptionProducer } from '@nestposts/retry-policy/adapters/inngest-exception.producer';
import { RmqExceptionProducer } from '@nestposts/retry-policy/adapters/rmq-exception.producer';
import { SqsExceptionProducer } from '@nestposts/retry-policy/adapters/sqs-exception.producer';
import type { ExceptionProducer } from '@nestposts/retry-policy/base-exeception-producer';

import type { AppConfig } from '../../config/app.config';
import type { AwsConfig } from '../../config/aws.config';
import { InboundTransport } from './inbound-transport';

export class ExceptionProducers {
  static for(app: AppConfig, aws: AwsConfig): ExceptionProducer {
    switch (app.transport) {
      case 'aws':
        return new SqsExceptionProducer(aws.client);
      case 'rabbitmq':
        return new RmqExceptionProducer(InboundTransport.retryTopology(app));
      default:
        return new InngestExceptionProducer({
          retryDelayMs: app.retryDelayMs,
        });
    }
  }
}
