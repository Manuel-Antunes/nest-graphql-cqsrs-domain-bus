import { BaseRpcContext } from '@nestjs/microservices';
import type { Context as LambdaContext, SQSRecord } from 'aws-lambda';
import type { EnvelopeMetadata } from '../outbound/event-envelope';

type SqsContextArgs = [
  record: SQSRecord,
  pattern: string,
  lambdaContext: LambdaContext | undefined,
  attributes: EnvelopeMetadata,
];

/**
 * **The delivery itself, for a handler that needs more than the event** — the counterpart of
 * `RmqContext`.
 *
 * `@TransportEvent()` answers with the domain event and that is what a controller should want. This
 * is the rest: the raw record (its receipt handle, its receive count, the queue it came from) and,
 * in a Lambda, the invocation it arrived in.
 */
export class SqsContext extends BaseRpcContext<SqsContextArgs> {
  constructor(args: SqsContextArgs) {
    super(args);
  }

  /** The delivery as SQS described it. */
  getRecord(): SQSRecord {
    return this.args[0];
  }

  /** The pattern this record matched — the event's routing key, not the handler's wildcard. */
  getPattern(): string {
    return this.args[1];
  }

  /**
   * The Lambda invocation, or `undefined` when the consumer is polling: a long-running process
   * receiving messages has no invocation, and a synthetic one would only be a lie with an
   * `awsRequestId` in it.
   */
  getLambdaContext(): LambdaContext | undefined {
    return this.args[2];
  }

  /** The record's message attributes, flattened — the routing facts the subscription filtered on. */
  getMessageAttributes(): EnvelopeMetadata {
    return this.args[3];
  }

  getMessageId(): string {
    return this.args[0].messageId;
  }

  getReceiptHandle(): string {
    return this.args[0].receiptHandle;
  }

  getEventSourceArn(): string {
    return this.args[0].eventSourceARN;
  }

  /**
   * How many times this message has been delivered, **0 on the first** — SQS counts from one
   * (`ApproximateReceiveCount`), and every retry policy reads better against a count of retries than
   * against a count of deliveries.
   */
  getRetryCount(): number {
    const received = Number.parseInt(this.args[0].attributes?.ApproximateReceiveCount ?? '', 10);
    return Number.isNaN(received) ? 0 : Math.max(0, received - 1);
  }
}
