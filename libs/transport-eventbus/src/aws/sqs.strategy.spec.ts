import {
  DeleteMessageBatchCommand,
  type Message,
  ReceiveMessageCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import type { MessageHandler } from '@nestjs/microservices';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import {
  type EventEnvelope,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
} from '../outbound/event-envelope';
import { SqsContext } from './sqs.context';
import { SqsEventEnvelopeDeserializer } from '../inbound/deserializers/sqs-event-envelope.deserializer';
import { SqsStrategy, type SqsStrategyOptions } from './sqs.strategy';

const QUEUE_ARN = 'arn:aws:sqs:us-east-1:000000000000:nestposts-tagging';
const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/000000000000/nestposts-tagging';

const body = (pattern: string, data: object = { postId: 'p-1' }) =>
  JSON.stringify({
    pattern,
    data,
    metadata: {
      [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCreated#2.0.0',
      [TRANSPORT_IDENTIFIER]: 'evt-1',
    },
  });

const record = (overrides: Partial<SQSRecord> = {}): SQSRecord => ({
  messageId: 'm-1',
  receiptHandle: 'r-1',
  body: body('posts.PostCreated.p-1'),
  attributes: { ApproximateReceiveCount: '1' } as SQSRecord['attributes'],
  messageAttributes: {},
  md5OfBody: '',
  eventSource: 'aws:sqs',
  eventSourceARN: QUEUE_ARN,
  awsRegion: 'us-east-1',
  ...overrides,
});

const delivery = (...records: SQSRecord[]): SQSEvent => ({ Records: records });

const strategyOf = (options: Partial<SqsStrategyOptions> = {}): SqsStrategy =>
  new SqsStrategy({ deserializer: new SqsEventEnvelopeDeserializer(), ...options });

const handlerOf = (implementation: (data: unknown, context: SqsContext) => unknown): MessageHandler =>
  implementation as unknown as MessageHandler;

const postIdOf = (data: unknown): string =>
  ((data as EventEnvelope<Record<string, unknown>>).data as { postId: string }).postId;

class FakeSqs {
  readonly deleted: string[] = [];
  private readonly batches: Message[][] = [];

  enqueue(...messages: Message[]): void {
    this.batches.push(messages);
  }

  async send(command: unknown): Promise<unknown> {
    if (command instanceof ReceiveMessageCommand) {
      const next = this.batches.shift();
      if (next) {
        return { Messages: next };
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { Messages: [] };
    }
    if (command instanceof DeleteMessageBatchCommand) {
      for (const entry of command.input.Entries ?? []) {
        this.deleted.push(entry.ReceiptHandle as string);
      }
      return {};
    }
    return {};
  }

  destroy(): void {}

  asClient(): SQSClient {
    return this as unknown as SQSClient;
  }
}

describe('SqsStrategy', () => {
  describe('finding the handler', () => {
    it('matches a routing key against a namespace binding, which a queue cannot do for itself', async () => {
      const received: unknown[] = [];
      const strategy = strategyOf();
      strategy.addHandler(
        'posts.#',
        handlerOf((data) => {
          received.push(data);
        }),
        true,
      );

      const results = await strategy.processEvent(delivery(record()));

      expect(results).toEqual([{ response: undefined }]);
      expect(received).toHaveLength(1);
    });

    it('matches one event type across every aggregate', async () => {
      const received: unknown[] = [];
      const strategy = strategyOf();
      strategy.addHandler(
        'posts.PostCreated.*',
        handlerOf((data) => {
          received.push(data);
        }),
        true,
      );

      await strategy.processEvent(delivery(record()));

      expect(received).toHaveLength(1);
    });

    it('prefers the handler bound to the literal key over the wildcard', async () => {
      const taken: string[] = [];
      const strategy = strategyOf();
      strategy.addHandler('posts.#', handlerOf(() => taken.push('wildcard')), true);
      strategy.addHandler('posts.PostCreated.p-1', handlerOf(() => taken.push('exact')), true);

      await strategy.processEvent(delivery(record()));

      expect(taken).toEqual(['exact']);
    });

    it('acknowledges a message nothing is bound to, instead of redriving it forever', async () => {
      const strategy = strategyOf();
      strategy.addHandler('users.#', handlerOf(() => undefined), true);

      expect(await strategy.processEvent(delivery(record()))).toEqual([{ response: undefined }]);
    });

    it('fails a record whose body says nothing about what it is', async () => {
      const strategy = strategyOf();
      strategy.addHandler('posts.#', handlerOf(() => undefined), true);

      const [result] = await strategy.processEvent(
        delivery(record({ body: JSON.stringify({ data: { postId: 'p-1' } }) })),
      );

      expect((result.err as Error).message).toContain('carries no pattern');
    });
  });

  describe('the context the handler is given', () => {
    it('carries the record, the pattern and the retry count, counted from zero', async () => {
      let context: SqsContext | undefined;
      const strategy = strategyOf();
      strategy.addHandler(
        'posts.#',
        handlerOf((_data, given) => {
          context = given;
        }),
        true,
      );

      await strategy.processEvent(
        delivery(record({ attributes: { ApproximateReceiveCount: '3' } as SQSRecord['attributes'] })),
      );

      expect(context?.getPattern()).toBe('posts.PostCreated.p-1');
      expect(context?.getMessageId()).toBe('m-1');
      expect(context?.getRetryCount()).toBe(2);
      expect(context?.getLambdaContext()).toBeUndefined();
    });
  });

  describe('a batch', () => {
    it('answers one result per record, in order', async () => {
      const strategy = strategyOf();
      strategy.addHandler(
        'posts.#',
        handlerOf((data) => {
          if (postIdOf(data) === 'p-2') {
            throw new Error('boom');
          }
        }),
        true,
      );

      const results = await strategy.processEvent(
        delivery(
          record({ messageId: 'm-1', body: body('posts.PostCreated.p-1', { postId: 'p-1' }) }),
          record({ messageId: 'm-2', body: body('posts.PostCreated.p-2', { postId: 'p-2' }) }),
          record({ messageId: 'm-3', body: body('posts.PostCreated.p-3', { postId: 'p-3' }) }),
        ),
      );

      expect(results.map((result) => Boolean(result.err))).toEqual([false, true, false]);
    });

    it('does not let the first failure stop the rest', async () => {
      const handled: string[] = [];
      const strategy = strategyOf();
      strategy.addHandler(
        'posts.#',
        handlerOf((data) => {
          handled.push(postIdOf(data));
          if (postIdOf(data) === 'p-1') {
            throw new Error('boom');
          }
        }),
        true,
      );

      await strategy.processEvent(
        delivery(
          record({ body: body('posts.PostCreated.p-1', { postId: 'p-1' }) }),
          record({ body: body('posts.PostCreated.p-2', { postId: 'p-2' }) }),
        ),
      );

      expect(handled).toEqual(['p-1', 'p-2']);
    });
  });

  describe('what a failure asks SQS for', () => {
    it('redelivers by default', async () => {
      const strategy = strategyOf();
      strategy.addHandler(
        'posts.#',
        handlerOf(() => {
          throw new Error('the database is down');
        }),
        true,
      );

      const [result] = await strategy.processEvent(delivery(record()));

      expect((result.err as Error).message).toBe('the database is down');
    });

  });

  describe('polling a queue', () => {
    it('dispatches what it receives and deletes only what succeeded', async () => {
      const sqs = new FakeSqs();
      sqs.enqueue(
        { MessageId: 'm-1', ReceiptHandle: 'r-1', Body: body('posts.PostCreated.p-1', { postId: 'p-1' }) },
        { MessageId: 'm-2', ReceiptHandle: 'r-2', Body: body('posts.PostCreated.p-2', { postId: 'p-2' }) },
      );
      const handled: string[] = [];
      const strategy = strategyOf({ queueUrl: QUEUE_URL, client: sqs.asClient() });
      strategy.addHandler(
        'posts.#',
        handlerOf((data) => {
          handled.push(postIdOf(data));
          if (postIdOf(data) === 'p-2') {
            throw new Error('boom');
          }
        }),
        true,
      );

      await strategy.listen(() => undefined);
      await vi.waitFor(() => expect(handled).toEqual(['p-1', 'p-2']));
      await vi.waitFor(() => expect(sqs.deleted).toEqual(['r-1']));
      await strategy.close();
    });
  });
});
