import { Logger } from '@nestjs/common';
import { RpcArgumentsHost } from '@nestjs/common/internal';

import { NonRetriableException } from './error/non-retriable.exception';
import { RetryAfterException } from './error/retry-after.exception';

export abstract class ExceptionProducer {
  protected readonly logger = new Logger(this.constructor.name);

  abstract getRetryCountFromContext(host: RpcArgumentsHost): number;

  async produceException(
    exception: any,
    host: RpcArgumentsHost,
    maxRetries: number,
    // Receives the live `RpcArgumentsHost`; structurally matches the
    // presentation-layer `SkipHandler` without infra depending on presentation.
    skipHandler?: (host: RpcArgumentsHost) => Promise<void> | void,
  ): Promise<unknown> {
    if (exception instanceof NonRetriableException) {
      return this.handleNonRetryableException(exception, host);
    }
    const currentRetryCount = this.getRetryCountFromContext(host);
    if (currentRetryCount >= maxRetries) {
      this.logger.warn(
        `Max retries (${
          maxRetries
        }) exceeded for message. Handling as non-retriable exception.`,
      );

      if (skipHandler) {
        try {
          await skipHandler(host);
        } catch (err) {
          this.logger.error('Error in skipHandler:', err);
        }
      }

      try {
        await this.onRetriesExhausted(exception, host);
      } catch (exhaustedError) {
        this.logger.error('Error in onRetriesExhausted:', exhaustedError);
      }

      try {
        await this.commitOffset(host);
      } catch (commitError) {
        this.logger.error('Failed to commit offset:', commitError);
      }
      return; // Stop propagating the exception
    }

    const response = await this.republishWithRetry(
      exception,
      host,
      currentRetryCount + 1,
    );
    await this.commitOffset(host);
    return response;
  }

  private async republishWithRetry(
    exception: any,
    host: RpcArgumentsHost,
    retryCount: number,
  ) {
    if (exception instanceof RetryAfterException) {
      this.logger.warn(
        `Received RetryAfterException. Will retry after ${exception.retryAfter}.`,
      );
      return this.handleRetryAfterException(exception, host);
    }
    this.logger.error(
      `Error processing message. Attempt ${retryCount}. Error: ${
        exception instanceof Error ? exception.stack : String(exception)
      }`,
    );
    return this.handleGenericException(exception, host);
  }

  acknowledge(_host: RpcArgumentsHost): Promise<void> {
    return Promise.resolve();
  }

  protected onRetriesExhausted(
    _exception: unknown,
    _host: RpcArgumentsHost,
  ): Promise<void> {
    return Promise.resolve();
  }

  protected abstract commitOffset(host: RpcArgumentsHost): Promise<void>;

  protected abstract handleNonRetryableException(
    exception: NonRetriableException,
    host: RpcArgumentsHost,
  ): Promise<unknown> | unknown;

  protected abstract handleRetryAfterException(
    exception: RetryAfterException,

    host: RpcArgumentsHost,
  ): Promise<unknown> | unknown;

  protected abstract handleGenericException(
    exception: any,
    host: RpcArgumentsHost,
  ): Promise<unknown> | unknown;
}
