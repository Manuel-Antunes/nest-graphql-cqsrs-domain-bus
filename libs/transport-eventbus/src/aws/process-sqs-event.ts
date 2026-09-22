import { Logger } from '@nestjs/common';
import type { Context as LambdaContext, SQSEvent } from 'aws-lambda';
import type { SqsConsumer } from './sqs.strategy';

/**
 * What Lambda has to be told to redrive **these** records and delete the rest. It is only honoured
 * when the event-source mapping has `ReportBatchItemFailures` on — `batch: { partialResponses: true }`
 * on SST's `subscribe()`. Without the flag AWS ignores the object entirely and the whole batch is
 * decided by whether the invocation threw.
 */
export interface SqsBatchResponse {
  readonly batchItemFailures: { itemIdentifier: string }[];
}

/**
 * The `unwrap()` an application listening on {@link SqsStrategy} answers with.
 *
 * Declared as a concrete return rather than mirroring `INestMicroservice`'s generic
 * `unwrap<T>(): T` — the generic instantiates to this, so a real application satisfies it while a
 * double can too, which nothing can do honestly against `<T>() => T`.
 */
export interface SqsDrivenApplication {
  readonly unwrap: () => SqsConsumer;
}

/**
 * **The Lambda handler's body: hand the whole delivery to the application, report what failed.**
 *
 * ```ts
 * export const handler = async (event: SQSEvent, context: Context) =>
 *   processSqsEvent(await application(), event, context);
 * ```
 *
 * ## Why it neither throws nor returns bare
 * Those are the two things a handler is tempted to do, and both lose messages:
 *
 * - **returning successfully** tells SQS the whole batch is done, so a record that failed is deleted
 *   with the ones that succeeded — the work is simply gone, and nothing anywhere says so;
 * - **throwing** fails the whole batch, so the records that already succeeded are redelivered and
 *   run a second time. The inbox catches that, which is exactly why it exists, but the retry, the
 *   database work and the eventual dead-letter alarm are all paid for a message that was fine.
 *
 * `batchItemFailures` is the third answer: these failed, the rest are done. It is why the strategy
 * returns one result per record instead of throwing on the first.
 */
export const processSqsEvent = async (
  app: SqsDrivenApplication,
  event: SQSEvent,
  lambdaContext?: LambdaContext,
): Promise<SqsBatchResponse> => {
  const logger = new Logger('processSqsEvent');
  const results = await app.unwrap().processEvent(event, lambdaContext);
  const batchItemFailures: { itemIdentifier: string }[] = [];

  results.forEach((result, index) => {
    if (!result.err) {
      return;
    }
    const record = event.Records[index];
    const stack = result.err instanceof Error ? result.err.stack : String(result.err);

    if (!record?.messageId) {
      logger.error(
        `record #${index} failed and carries no messageId, so it cannot be reported as a partial ` +
          'failure; AWS would reject the response and redrive the whole batch',
        stack,
      );
      return;
    }
    logger.error(`${record.messageId} failed and will be redelivered`, stack);
    batchItemFailures.push({ itemIdentifier: record.messageId });
  });

  return { batchItemFailures };
};
