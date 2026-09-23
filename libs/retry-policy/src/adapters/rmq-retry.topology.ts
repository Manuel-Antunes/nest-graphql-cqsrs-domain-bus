export const DEFAULT_RMQ_RETRY_DELAY_MS = 5_000;

const DEFAULT_EXCHANGE = '';

export interface RmqRetryTopologyOptions {
  readonly queue: string;
  readonly retryDelayMs?: number;
  readonly deadLetterQueue?: string | false;
}

export interface RmqQueueAsserter {
  assertQueue(queue: string, options?: Record<string, unknown>): unknown;
}

export class RmqRetryTopology {
  readonly queue: string;
  readonly retryQueue: string;
  readonly delayedQueue: string;
  readonly deadLetterQueue?: string;
  readonly retryDelayMs: number;

  constructor(options: RmqRetryTopologyOptions) {
    this.queue = options.queue;
    this.retryQueue = `${options.queue}.retry`;
    this.delayedQueue = `${options.queue}.delayed`;
    this.deadLetterQueue =
      options.deadLetterQueue === false
        ? undefined
        : (options.deadLetterQueue ?? `${options.queue}.dead`);
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RMQ_RETRY_DELAY_MS;
  }

  queueArguments(): Record<string, unknown> {
    return {
      'x-dead-letter-exchange': DEFAULT_EXCHANGE,
      'x-dead-letter-routing-key': this.retryQueue,
    };
  }

  queueOptions(
    options: Record<string, unknown> = {},
  ): Record<string, unknown> & { arguments: Record<string, unknown> } {
    return {
      durable: true,
      ...options,
      arguments: {
        ...((options.arguments as Record<string, unknown> | undefined) ?? {}),
        ...this.queueArguments(),
      },
    };
  }

  async assert(channel: RmqQueueAsserter): Promise<void> {
    await channel.assertQueue(this.retryQueue, {
      durable: true,
      arguments: {
        'x-message-ttl': this.retryDelayMs,
        ...this.backToMainQueue(),
      },
    });
    await channel.assertQueue(this.delayedQueue, {
      durable: true,
      arguments: this.backToMainQueue(),
    });
    if (this.deadLetterQueue) {
      await channel.assertQueue(this.deadLetterQueue, { durable: true });
    }
  }

  private backToMainQueue(): Record<string, unknown> {
    return {
      'x-dead-letter-exchange': DEFAULT_EXCHANGE,
      'x-dead-letter-routing-key': this.queue,
    };
  }
}
