import { MikroORM } from '@mikro-orm/core';
import { dropTestSchema, ensureTestSchema, testDatabaseConfig } from '@nestposts/database/testing';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Injectable, type Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AsyncContext, CqrsModule, EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { Test, type TestingModule } from '@nestjs/testing';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import {
  EventEnvelope,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
} from '../outbound/event-envelope';
import { MessageInbox, MikroOrmMessageInbox } from '../persistence/message-inbox';
import { transportEntities } from '../persistence/message-inbox.entity';
import { CORRELATION_ID, CorrelatedRequestContext, RequestContextCodec, TransportRequestContext } from '../request-context';
import { eventIngestionProviders, transportEventBusProviders } from '../transport-event-bus.providers';
import { TransportIdentity } from '../transport-identity';
import { MemoryEventEnvelopeSerializer } from '../outbound/serializers/memory-event-envelope.serializer';
import { MemoryEventEnvelopeDeserializer } from './deserializers/memory-event-envelope.deserializer';
import { EventIngestion } from './event-ingestion';
import { TransportEventPipe } from './transport-event.pipe';
import { EventLog } from '../persistence/event-log/event-log';

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
}

@EventsHandler(PostCreatedEvent)
class PostCreatedHandler implements IEventHandler<PostCreatedEvent> {
  constructor(private readonly received: Received) {}

  handle(event: PostCreatedEvent): void {
    this.received.events.push(event);
    this.received.contexts.push(AsyncContext.of(event));
  }
}


const serializer = new MemoryEventEnvelopeSerializer();
const deserializer = new MemoryEventEnvelopeDeserializer();
const pipe = new TransportEventPipe();

const arrivingFrom = (
  origin: string,
  identifier = 'evt-1',
  metadata: Record<string, string> = {},
  messageType = 'posts.PostCreated#1.0.0',
): object => {
  const envelope = new EventEnvelope(
    { postId: 'p-1', occurredAt: new Date('2026-09-08T12:00:00.000Z') },
    {
      [TRANSPORT_MESSAGE_TYPE]: messageType,
      [TRANSPORT_IDENTIFIER]: identifier,
      [TRANSPORT_TIMESTAMP]: '2026-09-08T12:00:00.000Z',
      [TRANSPORT_ORIGIN]: origin,
      [TRANSPORT_TAGS]: 'postId=p-1',
      ...metadata,
    },
  );
  const wire = JSON.parse(
    JSON.stringify(serializer.serialize({ pattern: 'posts.PostCreated.p-1', data: envelope })),
  ) as unknown;

  return pipe.transform(deserializer.deserialize(wire).data);
};

const moduleWith = async (overrides: Provider[] = []): Promise<TestingModule> => {
  const module = await Test.createTestingModule({
    imports: [
      CqrsModule.forRoot(),
      DiscoveryModule,
      MikroOrmModule.forRoot(
        testDatabaseConfig({
          entities: [...transportEntities],
          allowGlobalContext: true,
        }),
      ),
    ],
    providers: [
      ...transportEventBusProviders,
      ...eventIngestionProviders,
      { provide: TransportIdentity, useValue: TransportIdentity.silent('posts-api') },
      { provide: RequestContextCodec, useClass: CorrelatedRequestContext },
      { provide: MessageInbox, useClass: MikroOrmMessageInbox },
      Received,
      PostCreatedHandler,
      ...overrides,
    ],
  }).compile();
  await module.init();
  await ensureTestSchema(module.get(MikroORM));
  return module;
};

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
    await expect(module.get(MessageInbox).received()).resolves.toHaveLength(0);
  });

  it('remembers what it ingested, and from whom', async () => {
    await ingestion.ingest(arrivingFrom('tagging', 'evt-remembered'));

    await expect(module.get(MessageInbox).received()).resolves.toEqual([
      expect.objectContaining({
        identifier: 'evt-remembered',
        messageType: 'posts.PostCreated#1.0.0',
        origin: 'tagging',
      }),
    ]);
  });

  it('restores the request that crossed, so the handler runs in it', async () => {
    await ingestion.ingest(arrivingFrom('tagging', 'evt-with-request', { [CORRELATION_ID]: 'c-1' }));
    await settle();

    const context = received.contexts[0];
    expect(context).toBeInstanceOf(TransportRequestContext);
    expect(context).toMatchObject({ correlationId: 'c-1', causationId: 'evt-with-request' });
  });

  it('publishes with no context when no request crossed', async () => {
    await ingestion.ingest(arrivingFrom('tagging'));
    await settle();

    expect(received.contexts[0]).toBeUndefined();
  });

  it('accepts an undeclared message type instead of rejecting it forever', async () => {
    const unknown = arrivingFrom('tagging', 'evt-unknown', {}, 'billing.InvoiceIssued#1.0.0');

    await expect(ingestion.ingest(unknown)).resolves.toBeUndefined();
    await expect(module.get(MessageInbox).received()).resolves.toHaveLength(1);
  });

  it('refuses an event that did not come through @TransportEvent(): there is nothing to remember', async () => {
    await expect(ingestion.ingest(new PostCreatedEvent('p-9', new Date()))).rejects.toThrow(
      /did not come through @TransportEvent\(\)/,
    );
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
      const custom = await moduleWith([{ provide: EventLog, useClass: RecordingLog }]);
      RecordingLog.appended.length = 0;

      try {
        await custom.get(EventIngestion).ingest(arrivingFrom('tagging', 'evt-log'));
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
