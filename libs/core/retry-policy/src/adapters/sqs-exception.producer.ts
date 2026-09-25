import { ChangeMessageVisibilityCommand, SQSClient } from '@aws-sdk/client-sqs';
import { RpcArgumentsHost } from '@nestjs/common/internal';
import type { AwsClientConfig } from '@nestposts/microservices-aws/aws-client.config';
import { queueUrlFromArn } from '@nestposts/microservices-aws/aws-client.config';
import { SqsContext } from '@nestposts/microservices-aws/sqs.context';

import { ExceptionProducer } from '../base-exeception-producer';
import { NonRetriableException } from '../error/non-retriable.exception';
import { RetryAfterException } from '../error/retry-after.exception';

/** SQS caps a message's visibility timeout at 12 hours. */
const MAX_VISIBILITY_SECONDS = 43_200;

/**
 * Retry policy for the SQS transport.
 *
 * SQS has no "republish for retry" primitive — retries are native redelivery:
 * the Lambda handler re-throwing the record's error (see `functions/lambda.js`)
 * leaves the message undeleted, so SQS redelivers it after the visibility
 * timeout and increments `ApproximateReceiveCount`. So the policy maps to:
 *
 *  - **retry** → THROW. The error propagates to `result.err`, the Lambda
 *    re-throws, SQS redelivers (`ApproximateReceiveCount++`).
 *  - **skip / non-retriable** → RETURN (don't throw). The handler "succeeds",
 *    the Lambda returns, SQS deletes the message — no further retry.
 *  - **retry-after** → `ChangeMessageVisibility(receiptHandle, N)` then THROW,
 *    so the redelivery happens after `N` seconds instead of the queue default.
 *
 * The retry count comes from the SQS SYSTEM attribute `ApproximateReceiveCount`
 * (1 on first delivery), which lives on `record.attributes` — NOT the custom
 * `messageAttributes` the strategy surfaces via `getMessageAttributes()`.
 */
export class SqsExceptionProducer extends ExceptionProducer {
  constructor(
    private readonly clientConfig: AwsClientConfig = {},
    private readonly sqsClient: SQSClient = new SQSClient(clientConfig),
  ) {
    super();
  }

  getRetryCountFromContext(host: RpcArgumentsHost): number {
    const context = host.getContext<unknown>();
    return context instanceof SqsContext ? context.getRetryCount() : 0;
  }

  protected override commitOffset(_host: RpcArgumentsHost): Promise<void> {
    // SQS "commit" = deleting the message, which the Lambda ESM does
    // automatically when the handler returns without throwing. So the skip
    // path returning normally is what acks the message — nothing to do here.
    return Promise.resolve();
  }

  protected override handleNonRetryableException(
    exception: NonRetriableException,
    _host: RpcArgumentsHost,
  ): Promise<unknown> | unknown {
    // Returning (not throwing) makes the record "succeed" → SQS deletes it →
    // no retry. This is the terminal drop for a poison message.
    this.logger.warn(
      `NonRetriableException — dropping message without retry: ${exception.message}`,
    );
    return undefined;
  }

  protected override async handleRetryAfterException(
    exception: RetryAfterException,
    host: RpcArgumentsHost,
  ): Promise<unknown> {
    const seconds = exception.delayInMilliseconds() / 1000;
    await this.changeVisibility(host, seconds);
    // Throw so the record fails and SQS redelivers — now after `seconds`.
    throw exception;
  }

  protected override handleGenericException(
    exception: unknown,
    _host: RpcArgumentsHost,
  ): Promise<unknown> | unknown {
    // Throw → record fails → Lambda re-throws → SQS redelivers (count++).
    throw exception;
  }

  private async changeVisibility(
    host: RpcArgumentsHost,
    seconds: number,
  ): Promise<void> {
    if (!this.sqsClient) {
      this.logger.warn(
        'RetryAfter requested but no SQSClient configured — falling back to the queue default visibility timeout.',
      );
      return;
    }
    const record = host.getContext<SqsContext>().getRecord();
    const queueUrl = queueUrlFromArn(
      record.eventSourceARN,
      this.clientConfig.endpoint,
    );
    if (!queueUrl || !record.receiptHandle) {
      this.logger.warn(
        'RetryAfter requested but record is missing queue ARN / receipt handle — using the default visibility timeout.',
      );
      return;
    }
    try {
      await this.sqsClient.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: record.receiptHandle,
          VisibilityTimeout: Math.max(
            0,
            Math.min(Math.floor(seconds), MAX_VISIBILITY_SECONDS),
          ),
        }),
      );
    } catch (err) {
      // Best-effort: if the visibility change fails, the message still
      // redelivers after the queue default — degrade, don't crash the retry.
      this.logger.error(
        `Failed to ChangeMessageVisibility for retry-after: ${
          (err as Error)?.message ?? err
        }`,
      );
    }
  }
}
