import { InngestExceptionProducer } from '@nestposts/retry-policy/adapters/inngest-exception.producer';
import { RmqExceptionProducer } from '@nestposts/retry-policy/adapters/rmq-exception.producer';
import { SqsExceptionProducer } from '@nestposts/retry-policy/adapters/sqs-exception.producer';
import type { ExceptionProducer } from '@nestposts/retry-policy/base-exeception-producer';

import {
  inboundRetryTopology,
  retryDelayMs,
  transportMode,
} from './transport.config';

export const exceptionProducer = (): ExceptionProducer => {
  switch (transportMode()) {
    case 'aws':
      return new SqsExceptionProducer();
    case 'rabbitmq':
      return new RmqExceptionProducer(inboundRetryTopology());
    default:
      return new InngestExceptionProducer({ retryDelayMs: retryDelayMs() });
  }
};
