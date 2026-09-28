import { Logger } from '@nestjs/common';

import type { EventMessage } from '../messaging/event-message';
import type { ProcessingContext } from '../unit-of-work/processing-context';

/** A handler of a processing group failed on a message. */
export interface ErrorContext {
  readonly processingGroup: string;
  readonly error: unknown;
  readonly message: EventMessage;
  readonly context: ProcessingContext;
}

/**
 * **What a processing group does when one of its handlers fails** — Axon 5's `ErrorHandler`. Throwing
 * fails the unit of work the delivery runs in; returning means the failure was dealt with.
 */
export abstract class ErrorHandler {
  abstract handleError(errorContext: ErrorContext): void | Promise<void>;
}

/**
 * **Axon 5's default: the failure is the unit's.** A subscribing group's handler that fails rolls
 * back the unit that published — the command fails, the ingestion is redelivered — and a streaming
 * group's delivery is retried by the outbox and, in the end, dead-lettered.
 */
export class PropagatingErrorHandler extends ErrorHandler {
  handleError({ error }: ErrorContext): never {
    throw error;
  }
}

/** **The failure is logged and the unit goes on** — for a group whose work is not worth a rollback. */
export class LoggingErrorHandler extends ErrorHandler {
  private static readonly logger = new Logger(LoggingErrorHandler.name);

  handleError({ processingGroup, error, message }: ErrorContext): void {
    LoggingErrorHandler.logger.error(
      `processing group '${processingGroup}' failed on ${message.type} (${message.identifier}); the unit of work goes on`,
      error instanceof Error ? error.stack : String(error),
    );
  }
}
