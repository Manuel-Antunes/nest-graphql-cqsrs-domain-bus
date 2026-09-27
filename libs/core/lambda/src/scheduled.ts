import type { Context, ScheduledEvent } from 'aws-lambda';

import type { HandlerOptions } from './settle';
import { settle } from './settle';

export const scheduledHandler = <T>(
  booted: () => Promise<T>,
  work: (application: T, event: ScheduledEvent) => Promise<unknown>,
  options: HandlerOptions = {},
): ((event: ScheduledEvent, context: Context) => Promise<void>) => {
  return async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;
    try {
      await work(await booted(), event);
    } finally {
      await settle(options);
    }
  };
};
