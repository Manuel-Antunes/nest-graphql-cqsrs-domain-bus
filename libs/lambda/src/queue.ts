import type {
  SqsBatchResponse,
  SqsDrivenApplication,
} from '@nestposts/transport-eventbus';
import { processSqsEvent } from '@nestposts/transport-eventbus';
import type { Context, SQSEvent } from 'aws-lambda';

import type { HandlerOptions } from './settle';
import { settle } from './settle';

/**
 * **The queue entry point**: every record of the delivery dispatched, and only the failures
 * reported.
 *
 * It is {@link streamingHandler}'s counterpart and differs from it in one decision. When the
 * application is still booting, an HTTP caller gets a fast 503 because there is nowhere to put the
 * request; a queue message **has** somewhere — the queue. So a boot that has not finished is allowed
 * to throw: the batch fails, SQS redelivers it after the visibility timeout, and by then the
 * container is warm or another one takes it.
 *
 * `callbackWaitsForEmptyEventLoop` is turned off for the same reason as in the HTTP handler: this
 * application holds a database pool and OpenTelemetry's timers, so the event loop never drains and
 * every invocation would otherwise run to its timeout.
 */
export const queueHandler = (
  booted: () => Promise<SqsDrivenApplication>,
  options: HandlerOptions = {},
): ((event: SQSEvent, context: Context) => Promise<SqsBatchResponse>) => {
  return async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;
    try {
      return await processSqsEvent(await booted(), event, context);
    } finally {
      await settle(options);
    }
  };
};
