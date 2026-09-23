import type { RpcArgumentsHost } from '@nestjs/common/internal';
import { RmqContext } from '@nestjs/microservices';

import { NonRetriableException } from '../error/non-retriable.exception';
import { RetryAfterException } from '../error/retry-after.exception';
import type { RmqChannel, RmqDeliveredMessage } from './rmq-exception.producer';
import {
  RMQ_FAILURE_HEADER,
  RMQ_ORIGINAL_ROUTING_KEY_HEADER,
  RMQ_RETRY_ATTEMPT_HEADER,
  RmqExceptionProducer,
} from './rmq-exception.producer';
import { RmqRetryTopology } from './rmq-retry.topology';

const QUEUE = 'nestposts.tagging.post-events';

class FakeChannel implements RmqChannel {
  readonly calls: string[] = [];
  readonly asserted = new Map<string, Record<string, unknown> | undefined>();
  readonly sent: {
    queue: string;
    content: Buffer;
    options?: Record<string, unknown>;
  }[] = [];

  ack(): void {
    this.calls.push('ack');
  }

  nack(_message: RmqDeliveredMessage, allUpTo?: boolean, requeue?: boolean) {
    this.calls.push(`nack(allUpTo=${allUpTo}, requeue=${requeue})`);
  }

  sendToQueue(
    queue: string,
    content: Buffer,
    options?: Record<string, unknown>,
  ): boolean {
    this.calls.push(`send ${queue}`);
    this.sent.push({ queue, content, options });
    return true;
  }

  async assertQueue(
    queue: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    this.asserted.set(queue, options);
  }
}

const delivered = (
  headers: Record<string, unknown> = {},
): RmqDeliveredMessage => ({
  content: Buffer.from(JSON.stringify({ pattern: 'posts.PostPreCreated.p-1' })),
  fields: { routingKey: 'nestposts.tagging.post-events' },
  properties: { headers, contentType: 'application/json', messageId: 'm-1' },
});

const hostOf = (
  channel: FakeChannel,
  message: RmqDeliveredMessage,
): RpcArgumentsHost => {
  const context = new RmqContext([
    message,
    channel,
    'posts.PostPreCreated.p-1',
  ]);
  return {
    getData: () => ({}),
    getContext: () => context,
  } as unknown as RpcArgumentsHost;
};

const rejected = (queue: string, count: number) => ({
  queue: Buffer.from(queue),
  reason: Buffer.from('rejected'),
  count,
});

describe('RmqExceptionProducer', () => {
  const topology = new RmqRetryTopology({ queue: QUEUE, retryDelayMs: 1_000 });
  let producer: RmqExceptionProducer;
  let channel: FakeChannel;

  beforeEach(() => {
    producer = new RmqExceptionProducer(topology);
    channel = new FakeChannel();
  });

  describe('counting retries', () => {
    it('is zero on the first delivery', () => {
      expect(
        producer.getRetryCountFromContext(hostOf(channel, delivered())),
      ).toBe(0);
    });

    it('counts the rejections of its own queue, and nothing the retry queue expired', () => {
      const message = delivered({
        'x-death': [
          rejected(QUEUE, 2),
          {
            queue: `${QUEUE}.retry`,
            reason: Buffer.from('expired'),
            count: 2,
          },
          rejected('some.other.queue', 5),
        ],
      });

      expect(producer.getRetryCountFromContext(hostOf(channel, message))).toBe(
        2,
      );
    });

    it('adds the attempts a retry-after carried across its republish', () => {
      const message = delivered({
        [RMQ_RETRY_ATTEMPT_HEADER]: 2,
        'x-death': [rejected(QUEUE, 1)],
      });

      expect(producer.getRetryCountFromContext(hostOf(channel, message))).toBe(
        3,
      );
    });
  });

  it('rejects a failure under the ceiling without requeueing, which dead-letters it into the delay', async () => {
    await producer.produceException(
      new Error('the saga command refused'),
      hostOf(channel, delivered()),
      3,
    );

    expect(channel.calls).toEqual(['nack(allUpTo=false, requeue=false)']);
    expect(channel.asserted.get(`${QUEUE}.retry`)).toEqual({
      durable: true,
      arguments: {
        'x-message-ttl': 1_000,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': QUEUE,
      },
    });
  });

  it('parks a message whose retries ran out under the key it was published with, not the one the delay gave it', async () => {
    const skipped: string[] = [];

    await producer.produceException(
      new Error('the saga command refused'),
      hostOf(channel, delivered({ 'x-death': [rejected(QUEUE, 3)] })),
      3,
      () => {
        skipped.push('skip');
      },
    );

    expect(skipped).toEqual(['skip']);
    expect(channel.calls).toEqual([`send ${QUEUE}.dead`, 'ack']);
    expect(channel.sent[0].options).toMatchObject({
      contentType: 'application/json',
      messageId: 'm-1',
      headers: {
        [RMQ_RETRY_ATTEMPT_HEADER]: 3,
        [RMQ_FAILURE_HEADER]: 'the saga command refused',
        [RMQ_ORIGINAL_ROUTING_KEY_HEADER]: 'posts.PostPreCreated.p-1',
      },
    });
    expect(channel.sent[0].options?.headers).not.toHaveProperty('x-death');
  });

  it('parks a non-retriable failure straight away', async () => {
    await producer.produceException(
      new NonRetriableException('poison'),
      hostOf(channel, delivered()),
      3,
    );

    expect(channel.calls).toEqual([`send ${QUEUE}.dead`, 'ack']);
  });

  it('holds a retry-after in the delayed queue for as long as it asked, counting the attempt', async () => {
    await producer.produceException(
      new RetryAfterException('rate limited', 2),
      hostOf(channel, delivered({ 'x-death': [rejected(QUEUE, 1)] })),
      3,
    );

    expect(channel.calls).toEqual([`send ${QUEUE}.delayed`, 'ack']);
    expect(channel.sent[0].options).toMatchObject({
      expiration: '2000',
      headers: { [RMQ_RETRY_ATTEMPT_HEADER]: 2 },
    });
    expect(channel.sent[0].options?.headers).not.toHaveProperty('x-death');
  });

  it('acknowledges a handled message once, however many times it is asked', async () => {
    const host = hostOf(channel, delivered());

    await producer.acknowledge(host);
    await producer.acknowledge(host);

    expect(channel.calls).toEqual(['ack']);
  });

  it('points the main queue at the retry queue through the default exchange', () => {
    expect(topology.queueOptions()).toEqual({
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': `${QUEUE}.retry`,
      },
    });
  });
});
