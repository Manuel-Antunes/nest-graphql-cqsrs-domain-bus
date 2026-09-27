import { MikroORM } from '@mikro-orm/core';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import type { Provider } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { IEventHandler } from '@nestjs/cqrs';
import { AsyncContext, CqrsModule, EventsHandler } from '@nestjs/cqrs';
import type { OutboxEnvelope } from '@nestjs/outbox';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { UnitOfWorkCommands } from '@nestposts/cqsrs';
import {
  dropTestSchema,
  ensureTestSchema,
  testDatabaseConfig,
} from '@nestposts/database/testing';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import {
  encodeData,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
} from '../outbound/message-headers';
import { EventLog } from '../persistence/event-log/event-log';
import { MikroOrmOutboxStore } from '../persistence/outbox/mikro-orm-outbox.store';
import { outboxEntities } from '../persistence/outbox/outbox.entities';
import {
  CORRELATION_ID,
  CorrelatedRequestContext,
  TransportRequestContext,
} from '../request-context';
import { TransportEventBusModule } from '../transport-event-bus.module';
import { TransportIdentity } from '../transport-identity';
import { EventIngestion } from './event-ingestion';

@EventType({ namespace: 'posts', tags: ['postId'] })
class PostCreatedEvent {
  constructor(
    readonly postId: string,
    readonly occurredAt: Date,
  ) {}
}

@Injectable()
class Received {
  readonly events: PostCreatedEvent[] = [];
  readonly contexts: (AsyncContext | undefined)[] = [];
  refusals = 0;
}

@EventsHandler(PostCreatedEvent)
class PostCreatedHandler implements IEventHandler<PostCreatedEvent> {
  constructor(private readonly received: Received) {}

  handle(event: PostCreatedEvent): void {
    if (this.received.refusals > 0) {
      this.received.refusals -= 1;
      throw new Error('the reaction refused');
    }
    this.received.events.push(event);
    this.received.contexts.push(AsyncContext.of(event));
  }
}

const arrivingFrom = (
  origin: string,
  identifier = 'evt-1',
  headers: Record<string, string> = {},
  messageType = 'posts.PostCreated#1.0.0',
): OutboxEnvelope =>
  JSON.parse(
    JSON.stringify({
      id: identifier,
      topic: 'posts.PostCreated.p-1',
      key: 'posts/p-1',
      createdAt: 1_789_000_000_000,
      payload: encodeData({
        postId: 'p-1',
        occurredAt: new Date('2026-09-08T12:00:00.000Z'),
      }),
      headers: {
        [TRANSPORT_MESSAGE_TYPE]: messageType,
        [TRANSPORT_TIMESTAMP]: '2026-09-08T12:00:00.000Z',
        [TRANSPORT_ORIGIN]: origin,
        [TRANSPORT_TAGS]: 'postId=p-1',
        ...headers,
      },
    }),
  ) as OutboxEnvelope;

const moduleWith = async (
  overrides: Provider[] = [],
): Promise<TestingModule> => {
  const module = await Test.createTestingModule({
    imports: [
      CqrsModule.forRoot(),
      MikroOrmModule.forRoot(
        testDatabaseConfig({
          entities: [...outboxEntities],
          allowGlobalContext: true,
        }),
      ),
      TransportEventBusModule.forRoot({
        identity: TransportIdentity.silent('posts-api'),
        requestContext: CorrelatedRequestContext,
        inbox: true,
        providers: overrides,
      }),
    ],
    providers: [Received, PostCreatedHandler, UnitOfWorkCommands],
  }).compile();
  await module.init();
  await ensureTestSchema(module.get(MikroORM));
  return module;
};

const processed = (module: TestingModule) =>
  module.get(MikroOrmOutboxStore).processedBy('posts-api');

describe('EventIngestion', () => {
  let module: TestingModule;
  let ingestion: EventIngestion;
  let received: Received;

  const settle = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(async () => {
    module = await moduleWith();
    ingestion = module.get(EventIngestion);
    received = module.get(Received);
  });

  afterEach(async () => {
    await dropTestSchema(module.get(MikroORM));
    await module.close();
  });

  it('publishes the event the deserializer rebuilt, dates and all', async () => {
    await ingestion.ingest(arrivingFrom('tagging'));
    await settle();

    expect(received.events).toHaveLength(1);
    expect(received.events[0]).toBeInstanceOf(PostCreatedEvent);
    expect(received.events[0].postId).toBe('p-1');
    expect(received.events[0].occurredAt).toBeInstanceOf(Date);
  });

  it('ingests the same message once, however many times it is delivered', async () => {
    await ingestion.ingest(arrivingFrom('tagging', 'evt-redelivered'));
    await ingestion.ingest(arrivingFrom('tagging', 'evt-redelivered'));
    await settle();

    expect(received.events).toHaveLength(1);
  });

  it('ingests two different messages as two events', async () => {
    await ingestion.ingest(arrivingFrom('tagging', 'evt-1'));
    await ingestion.ingest(arrivingFrom('tagging', 'evt-2'));
    await settle();

    expect(received.events).toHaveLength(2);
  });

  it("drops this service's own echo without reaching the inbox", async () => {
    await ingestion.ingest(arrivingFrom('posts-api'));
    await settle();

    expect(received.events).toHaveLength(0);
    await expect(processed(module)).resolves.toHaveLength(0);
  });

  it('rolls the inbox row back with a reaction that failed, so the redelivery is acted on', async () => {
    received.refusals = 1;

    await expect(
      ingestion.ingest(arrivingFrom('tagging', 'evt-refused')),
    ).rejects.toThrow('the reaction refused');
    await expect(processed(module)).resolves.toHaveLength(0);

    await ingestion.ingest(arrivingFrom('tagging', 'evt-refused'));

    expect(received.events).toHaveLength(1);
    await expect(processed(module)).resolves.toHaveLength(1);
  });

  it('remembers what it ingested under its own name, and what it was and who sent it', async () => {
    await ingestion.ingest(arrivingFrom('tagging', 'evt-remembered'));

    await expect(processed(module)).resolves.toEqual([
      expect.objectContaining({
        messageId: 'evt-remembered',
        messageType: 'posts.PostCreated#1.0.0',
        origin: 'tagging',
      }),
    ]);
  });

  it('settles two deliveries of one message racing each other: one of them is acted on', async () => {
    await Promise.all([
      ingestion.ingest(arrivingFrom('tagging', 'evt-raced')),
      ingestion.ingest(arrivingFrom('tagging', 'evt-raced')),
    ]);
    await settle();

    expect(received.events).toHaveLength(1);
    await expect(processed(module)).resolves.toHaveLength(1);
  });

  it('restores the request that crossed, so the handler runs in it', async () => {
    await ingestion.ingest(
      arrivingFrom('tagging', 'evt-with-request', { [CORRELATION_ID]: 'c-1' }),
    );
    await settle();

    const context = received.contexts[0];
    expect(context).toBeInstanceOf(TransportRequestContext);
    expect(context).toMatchObject({
      correlationId: 'c-1',
      causationId: 'evt-with-request',
    });
  });

  it('publishes with no context when no request crossed', async () => {
    await ingestion.ingest(arrivingFrom('tagging'));
    await settle();

    expect(received.contexts[0]).toBeUndefined();
  });

  it('accepts an undeclared message type instead of rejecting it forever', async () => {
    const unknown = arrivingFrom(
      'tagging',
      'evt-unknown',
      {},
      'billing.InvoiceIssued#1.0.0',
    );

    await expect(ingestion.ingest(unknown)).resolves.toBeUndefined();
    await expect(processed(module)).resolves.toHaveLength(1);
  });

  it('refuses a payload that is not an envelope: there is nothing to remember', async () => {
    await expect(
      ingestion.ingest(new PostCreatedEvent('p-9', new Date()) as never),
    ).rejects.toThrow(/not an OutboxEnvelope/);
  });

  describe('the event log', () => {
    @Injectable()
    class RecordingLog extends EventLog {
      static readonly appended: object[] = [];

      async append(events: readonly object[]): Promise<void> {
        RecordingLog.appended.push(...events);
      }

      async readStream(): Promise<object[]> {
        return [];
      }

      async readAfter(): Promise<never[]> {
        return [];
      }

      async head(): Promise<string> {
        return '0';
      }
    }

    it('is appended inside the transaction, before anything reacts', async () => {
      const custom = await moduleWith([
        { provide: EventLog, useClass: RecordingLog },
      ]);
      RecordingLog.appended.length = 0;

      try {
        await custom
          .get(EventIngestion)
          .ingest(arrivingFrom('tagging', 'evt-log'));
        await settle();

        expect(RecordingLog.appended).toHaveLength(1);
        expect(RecordingLog.appended[0]).toBeInstanceOf(PostCreatedEvent);
      } finally {
        await dropTestSchema(custom.get(MikroORM));
        await custom.close();
      }
    });
  });
});
