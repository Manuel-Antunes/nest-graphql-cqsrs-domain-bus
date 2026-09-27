import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import {
  context as activeContext,
  propagation,
  ROOT_CONTEXT,
} from '@opentelemetry/api';

import { reportError } from './error-reporting';

/**
 * The channel `@nestjs/outbox` announces a dead letter on. It is read by name, so this library
 * depends on no outbox: an application without one never publishes on it.
 */
export const OUTBOX_DEAD_LETTERED_CHANNEL = 'nestjs:outbox:dead-lettered';

/** The part of a dead-lettered event a report needs. */
export interface DeadLettered {
  readonly message: {
    readonly id: string;
    readonly topic: string;
    readonly headers?: Readonly<Record<string, string>>;
  };
  readonly error: unknown;
  readonly attempt: number;
  readonly reason: string;
}

/**
 * **A message the outbox gave up on is an error somebody is told about**, in the trace of the work
 * that raised it — the `traceparent` the message was staged with — so the issue opens onto the
 * request whose event could not be published. Retries are not reported: they are the relay doing
 * its job, and the log has them.
 */
@Injectable()
export class DeadLetterReporting implements OnModuleInit, OnModuleDestroy {
  private readonly listener = (published: unknown): void => {
    void this.report(published as DeadLettered);
  };

  onModuleInit(): void {
    subscribe(OUTBOX_DEAD_LETTERED_CHANNEL, this.listener);
  }

  onModuleDestroy(): void {
    unsubscribe(OUTBOX_DEAD_LETTERED_CHANNEL, this.listener);
  }

  report({ message, error, attempt, reason }: DeadLettered): Promise<void> {
    const failure = error instanceof Error ? error : new Error(String(error));
    return activeContext.with(
      propagation.extract(ROOT_CONTEXT, { ...message.headers }),
      () =>
        reportError(failure, {
          level: 'error',
          tags: { 'outbox.topic': message.topic, 'outbox.reason': reason },
          extra: { 'outbox.message': message.id, 'outbox.attempts': attempt },
        }),
    );
  }
}
