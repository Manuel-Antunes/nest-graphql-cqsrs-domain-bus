import type { RpcArgumentsHost } from '@nestjs/common/internal';
import { InngestContext } from '@nestposts/microservices-inngest/inngest.context';
import { NonRetriableError, RetryAfterError } from 'inngest';

import { NonRetriableException } from '../error/non-retriable.exception';
import { RetryAfterException } from '../error/retry-after.exception';
import { InngestExceptionProducer } from './inngest-exception.producer';

const hostAt = (attempt: number): RpcArgumentsHost => {
  const context = new InngestContext([
    { name: 'posts.PostPreCreated', data: {} },
    'posts.#',
    {} as never,
    'run-1',
    attempt,
  ]);
  return {
    getData: () => ({}),
    getContext: () => context,
  } as unknown as RpcArgumentsHost;
};

describe('InngestExceptionProducer', () => {
  it('reads the attempt Inngest is on as the retry count, zero on the first run', () => {
    const producer = new InngestExceptionProducer();

    expect(producer.getRetryCountFromContext(hostAt(0))).toBe(0);
    expect(producer.getRetryCountFromContext(hostAt(2))).toBe(2);
  });

  it('rethrows an ordinary failure as it is, for Inngest to back off on its own', async () => {
    const failure = new Error('the saga command refused');

    await expect(
      new InngestExceptionProducer().produceException(failure, hostAt(0), 3),
    ).rejects.toBe(failure);
  });

  it('asks for the configured delay when one is set, rounded up to the second Inngest counts in', async () => {
    const produced = new InngestExceptionProducer({ retryDelayMs: 500 })
      .produceException(new Error('the saga command refused'), hostAt(1), 3)
      .catch((error: unknown) => error);

    const error = await produced;
    expect(error).toBeInstanceOf(RetryAfterError);
    expect((error as RetryAfterError).retryAfter).toBe('1');
  });

  it('completes the run once the retries ran out', async () => {
    await expect(
      new InngestExceptionProducer().produceException(
        new Error('the saga command refused'),
        hostAt(3),
        3,
      ),
    ).resolves.toBeUndefined();
  });

  it('stops Inngest retrying a non-retriable failure', async () => {
    await expect(
      new InngestExceptionProducer().produceException(
        new NonRetriableException('poison'),
        hostAt(0),
        3,
      ),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it('hands a retry-after in seconds to Inngest, which keeps it in seconds', async () => {
    const error = await new InngestExceptionProducer()
      .produceException(
        new RetryAfterException('rate limited', 2),
        hostAt(0),
        3,
      )
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(RetryAfterError);
    expect((error as RetryAfterError).retryAfter).toBe('2');
  });
});
