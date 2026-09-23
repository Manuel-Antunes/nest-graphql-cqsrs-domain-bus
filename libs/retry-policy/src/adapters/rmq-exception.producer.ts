import { RpcArgumentsHost } from '@nestjs/common/internal';
import { RmqContext } from '@nestjs/microservices';

import { ExceptionProducer } from '../base-exeception-producer';
import { NonRetriableException } from '../error/non-retriable.exception';
import { RetryAfterException } from '../error/retry-after.exception';
import type { RmqQueueAsserter } from './rmq-retry.topology';
import { RmqRetryTopology } from './rmq-retry.topology';

export const RMQ_RETRY_ATTEMPT_HEADER = 'x-retry-attempt';
export const RMQ_FAILURE_HEADER = 'x-retry-failure';
export const RMQ_ORIGINAL_ROUTING_KEY_HEADER = 'x-original-routing-key';

const DEATH_HEADER = 'x-death';

const COPIED_PROPERTIES = [
  'contentType',
  'contentEncoding',
  'correlationId',
  'messageId',
  'timestamp',
  'type',
  'appId',
  'deliveryMode',
  'priority',
] as const;

export interface RmqDeliveredMessage {
  readonly content: Buffer;
  readonly fields: { readonly routingKey: string };
  readonly properties: Record<string, unknown> & {
    readonly headers?: Record<string, unknown>;
  };
}

export interface RmqChannel extends RmqQueueAsserter {
  ack(message: RmqDeliveredMessage): void;
  nack(
    message: RmqDeliveredMessage,
    allUpTo?: boolean,
    requeue?: boolean,
  ): void;
  sendToQueue(
    queue: string,
    content: Buffer,
    options?: Record<string, unknown>,
  ): boolean;
}

interface Delivery {
  readonly channel: RmqChannel;
  readonly message: RmqDeliveredMessage;
  readonly pattern: string;
}

export class RmqExceptionProducer extends ExceptionProducer {
  private readonly settled = new WeakSet<object>();
  private readonly asserted = new WeakMap<object, Promise<void>>();

  constructor(private readonly topology: RmqRetryTopology) {
    super();
  }

  getRetryCountFromContext(host: RpcArgumentsHost): number {
    const delivery = deliveryOf(host);
    if (!delivery) {
      return 0;
    }
    const headers = delivery.message.properties.headers ?? {};
    return attemptsIn(headers) + rejectionsIn(headers, this.topology.queue);
  }

  override acknowledge(host: RpcArgumentsHost): Promise<void> {
    this.settle(host, (channel, message) => channel.ack(message));
    return Promise.resolve();
  }

  protected override commitOffset(host: RpcArgumentsHost): Promise<void> {
    return this.acknowledge(host);
  }

  protected override async onRetriesExhausted(
    exception: unknown,
    host: RpcArgumentsHost,
  ): Promise<void> {
    await this.park(exception, host);
  }

  protected override async handleNonRetryableException(
    exception: NonRetriableException,
    host: RpcArgumentsHost,
  ): Promise<void> {
    this.logger.warn(
      `NonRetriableException — dropping message without retry: ${exception.message}`,
    );
    await this.park(exception, host);
    await this.acknowledge(host);
  }

  protected override async handleGenericException(
    _exception: unknown,
    host: RpcArgumentsHost,
  ): Promise<void> {
    const delivery = deliveryOf(host);
    if (!delivery) {
      return;
    }
    await this.ensureTopology(delivery.channel);
    this.settle(host, (channel, message) =>
      channel.nack(message, false, false),
    );
  }

  protected override async handleRetryAfterException(
    exception: RetryAfterException,
    host: RpcArgumentsHost,
  ): Promise<void> {
    const delivery = deliveryOf(host);
    if (!delivery) {
      return;
    }
    await this.ensureTopology(delivery.channel);
    const { message } = delivery;
    delivery.channel.sendToQueue(this.topology.delayedQueue, message.content, {
      ...propertiesOf(message),
      headers: {
        ...withoutDeaths(message.properties.headers),
        [RMQ_RETRY_ATTEMPT_HEADER]: this.getRetryCountFromContext(host) + 1,
      },
      expiration: String(Math.ceil(exception.delayInMilliseconds())),
    });
    await this.acknowledge(host);
  }

  private async park(
    exception: unknown,
    host: RpcArgumentsHost,
  ): Promise<void> {
    const delivery = deliveryOf(host);
    const deadLetterQueue = this.topology.deadLetterQueue;
    if (!delivery || !deadLetterQueue) {
      return;
    }
    await this.ensureTopology(delivery.channel);
    const { message } = delivery;
    delivery.channel.sendToQueue(deadLetterQueue, message.content, {
      ...propertiesOf(message),
      headers: {
        ...withoutDeaths(message.properties.headers),
        [RMQ_RETRY_ATTEMPT_HEADER]: this.getRetryCountFromContext(host),
        [RMQ_FAILURE_HEADER]:
          exception instanceof Error ? exception.message : String(exception),
        [RMQ_ORIGINAL_ROUTING_KEY_HEADER]:
          delivery.pattern || message.fields.routingKey,
      },
    });
    this.logger.warn(
      `message parked in ${deadLetterQueue} after ${this.getRetryCountFromContext(host)} retries`,
    );
  }

  private ensureTopology(channel: RmqChannel): Promise<void> {
    let asserted = this.asserted.get(channel);
    if (!asserted) {
      asserted = this.topology.assert(channel);
      this.asserted.set(channel, asserted);
      asserted.catch(() => this.asserted.delete(channel));
    }
    return asserted;
  }

  private settle(
    host: RpcArgumentsHost,
    action: (channel: RmqChannel, message: RmqDeliveredMessage) => void,
  ): void {
    const delivery = deliveryOf(host);
    if (!delivery || this.settled.has(delivery.message)) {
      return;
    }
    this.settled.add(delivery.message);
    action(delivery.channel, delivery.message);
  }
}

const deliveryOf = (host: RpcArgumentsHost): Delivery | undefined => {
  const context = host.getContext<unknown>();
  if (!(context instanceof RmqContext)) {
    return undefined;
  }
  return {
    channel: context.getChannelRef() as RmqChannel,
    message: context.getMessage() as RmqDeliveredMessage,
    pattern: context.getPattern(),
  };
};

const text = (value: unknown): string =>
  Buffer.isBuffer(value) ? value.toString('utf8') : String(value);

const attemptsIn = (headers: Record<string, unknown>): number => {
  const attempts = Number(text(headers[RMQ_RETRY_ATTEMPT_HEADER] ?? 0));
  return Number.isFinite(attempts) ? attempts : 0;
};

const rejectionsIn = (
  headers: Record<string, unknown>,
  queue: string,
): number => {
  const deaths = headers[DEATH_HEADER];
  if (!Array.isArray(deaths)) {
    return 0;
  }
  return deaths
    .filter(
      (death: Record<string, unknown>) =>
        text(death?.queue) === queue && text(death?.reason) === 'rejected',
    )
    .reduce(
      (total: number, death: Record<string, unknown>) =>
        total + Number(death.count ?? 0),
      0,
    );
};

const withoutDeaths = (
  headers: Record<string, unknown> | undefined,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(headers ?? {}).filter(([key]) => key !== DEATH_HEADER),
  );

const propertiesOf = (message: RmqDeliveredMessage): Record<string, unknown> =>
  Object.fromEntries(
    COPIED_PROPERTIES.map((key) => [key, message.properties[key]]).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
