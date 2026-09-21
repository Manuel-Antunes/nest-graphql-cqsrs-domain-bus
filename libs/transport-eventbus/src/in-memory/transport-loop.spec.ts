import { MikroOrmModule } from '@mikro-orm/nestjs';
import { defineConfig } from '@mikro-orm/sqlite';
import type { MemoryServer } from '@camcima/nestjs-memory-microservices';
import { Controller, Injectable } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AsyncContext, CqrsModule, EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { EventPattern } from '@nestjs/microservices';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import { TRANSPORT_EVENT_BUS_SERVICE } from '../constants';
import { Publisher } from '../decorators/publisher.decorator';
import { EventIngestion } from '../inbound/event-ingestion';
import { IngestionSink, NoDurableState } from '../inbound/ingestion-sink';
import { TransportEvent } from '../decorators/transport-event.decorator';
import { MemoryEventEnvelopeSerializer } from '../outbound/serializers/memory-event-envelope.serializer';
import { MessageInbox, MikroOrmMessageInbox } from '../persistence/message-inbox';
import { transportEntities } from '../persistence/message-inbox.entity';
import {
  CorrelatedRequestContext,
  RequestContextCodec,
  TransportRequestContext,
} from '../request-context';
import { type InProcessService, startInProcessService } from '../testing/in-process-service';
import { eventIngestionProviders, transportEventBusProviders } from '../transport-event-bus.providers';
import type { TransportEventBusService } from '../transport-event-bus.service';
import { TransportIdentity } from '../transport-identity';
import { MemoryClient } from './memory-client';

const POSTS = 'posts';

@EventType({ namespace: 'posts', tags: ['postId'] })
class PostPreCreatedEvent {
  constructor(
    readonly postId: string,
    readonly title: string,
    readonly occurredAt: Date,
  ) {}
}

@EventType({ namespace: 'users', tags: ['userId'] })
class UserRegisteredEvent {
  constructor(
    readonly userId: string,
    readonly occurredAt: Date,
  ) {}
}

class PostRequest extends AsyncContext {
  constructor(readonly postId: string) {
    super();
  }

  toAttributes(): Record<string, string> {
    return { 'post-id': this.postId };
  }
}

const wire: { readonly toConsuming: MemoryServer[]; readonly toPublishing: MemoryServer[] } = {
  toConsuming: [],
  toPublishing: [],
};

@Injectable()
class PublishingIdentity extends TransportIdentity {
  readonly applicationName = 'publishing-service';
}

@Injectable()
@Publisher(POSTS)
class PublishingOutbox {
  readonly client: MemoryClient;

  constructor() {
    this.client = new MemoryClient({
      servers: () => wire.toConsuming,
      serializer: new MemoryEventEnvelopeSerializer(),
    });
  }
}

@Injectable()
class Arrivals {
  readonly messages: object[] = [];
}

@Controller()
class ArrivalsController {
  constructor(private readonly arrivals: Arrivals) {}

  @EventPattern('posts.PostPreCreated.*')
  record(@TransportEvent() event: PostPreCreatedEvent): void {
    this.arrivals.messages.push(event);
  }
}

@Injectable()
class ConsumingIdentity extends TransportIdentity {
  readonly applicationName = 'consuming-service';
}

@Injectable()
@Publisher(POSTS)
class ConsumingOutbox {
  readonly client: MemoryClient;

  constructor() {
    this.client = new MemoryClient({
      servers: () => wire.toPublishing,
      serializer: new MemoryEventEnvelopeSerializer(),
    });
  }
}

@Injectable()
class Received {
  readonly events: PostPreCreatedEvent[] = [];
  readonly contexts: (AsyncContext | undefined)[] = [];
}

@EventsHandler(PostPreCreatedEvent)
class PostPreCreatedHandler implements IEventHandler<PostPreCreatedEvent> {
  constructor(private readonly received: Received) {}

  handle(event: PostPreCreatedEvent): void {
    this.received.events.push(event);
    this.received.contexts.push(AsyncContext.of(event));
  }
}

@Controller()
class PostEventsController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern('posts.PostPreCreated.*')
  postPreCreated(@TransportEvent() event: PostPreCreatedEvent): Promise<void> {
    return this.ingestion.ingest(event);
  }
}

describe('one hop between two services, over the in-process transport', () => {
  let publishing: InProcessService;
  let consuming: InProcessService;
  let publishingBus: TransportEventBusService;
  let consumingBus: TransportEventBusService;
  let arrivals: Arrivals;
  let received: Received;
  let inbox: MessageInbox;

  const settle = async () => {
    for (let turn = 0; turn < 20; turn++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  beforeAll(async () => {
    publishing = await startInProcessService({
      imports: [CqrsModule.forRoot(), DiscoveryModule],
      controllers: [ArrivalsController],
      providers: [
        ...transportEventBusProviders,
        { provide: TransportIdentity, useClass: PublishingIdentity },
        { provide: RequestContextCodec, useClass: CorrelatedRequestContext },
        PublishingOutbox,
        Arrivals,
      ],
    });
    wire.toPublishing.push(publishing.server);

    consuming = await startInProcessService({
      imports: [
        CqrsModule.forRoot(),
        DiscoveryModule,
        MikroOrmModule.forRoot(
          defineConfig({
            dbName: ':memory:',
            entities: [...transportEntities],
            ensureDatabase: { create: true },
            allowGlobalContext: true,
          }),
        ),
      ],
      controllers: [PostEventsController],
      providers: [
        ...transportEventBusProviders,
        ...eventIngestionProviders,
        { provide: TransportIdentity, useClass: ConsumingIdentity },
        { provide: RequestContextCodec, useClass: CorrelatedRequestContext },
        { provide: IngestionSink, useClass: NoDurableState },
        { provide: MessageInbox, useClass: MikroOrmMessageInbox },
        ConsumingOutbox,
        Received,
        PostPreCreatedHandler,
      ],
    });
    wire.toConsuming.push(consuming.server);

    publishingBus = publishing.app.get(TRANSPORT_EVENT_BUS_SERVICE);
    consumingBus = consuming.app.get(TRANSPORT_EVENT_BUS_SERVICE);
    arrivals = publishing.app.get(Arrivals);
    received = consuming.app.get(Received);
    inbox = consuming.app.get(MessageInbox);
  });

  afterAll(async () => {
    await publishing.app.close();
    await consuming.app.close();
  });

  beforeEach(() => {
    arrivals.messages.length = 0;
    received.events.length = 0;
    received.contexts.length = 0;
  });

  it('binds each service to the routing keys it declared, and to nothing else', () => {
    expect(publishing.app.get(PublishingOutbox).client.bindings()).toEqual([
      'posts.PostPreCreated.*',
    ]);
  });

  it('carries the event across as an instance of the real class, fields and dates intact', async () => {
    await publishingBus.publish(
      new PostPreCreatedEvent('p-1', 'Nest + GraphQL', new Date('2026-09-08T12:00:00.000Z')),
    );
    await settle();

    expect(received.events).toHaveLength(1);
    expect(received.events[0]).toBeInstanceOf(PostPreCreatedEvent);
    expect(received.events[0]).toMatchObject({ postId: 'p-1', title: 'Nest + GraphQL' });
    expect(received.events[0].occurredAt).toEqual(new Date('2026-09-08T12:00:00.000Z'));
  });

  it('restores the request that opened it, so the far side runs in the same one', async () => {
    const request = new PostRequest('p-2');

    await publishingBus.publish(
      new PostPreCreatedEvent('p-2', 'with a request', new Date()),
      request,
    );
    await settle();

    const context = received.contexts.at(-1);
    expect(context).toBeInstanceOf(TransportRequestContext);
    expect((context as TransportRequestContext).attributes).toMatchObject({ 'post-id': 'p-2' });
  });

  it('keeps one correlation id for every event of one request', async () => {
    const request = new PostRequest('p-3');

    await publishingBus.publish(new PostPreCreatedEvent('p-3', 'first', new Date()), request);
    await publishingBus.publish(new PostPreCreatedEvent('p-3', 'second', new Date()), request);
    await settle();

    const [first, second] = received.contexts.slice(-2) as TransportRequestContext[];
    expect(first.correlationId).toBe(second.correlationId);
  });

  it('remembers each message, and names the service it came from', async () => {
    await publishingBus.publish(new PostPreCreatedEvent('p-4', 'remembered', new Date()));
    await settle();

    await expect(inbox.received()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ origin: 'publishing-service' })]),
    );
  });

  it('delivers a redelivery of the same message to nobody', async () => {
    const event = new PostPreCreatedEvent('p-5', 'twice on the wire', new Date());

    await publishingBus.publish(event);
    await publishingBus.publish(event);
    await settle();

    expect(received.events).toHaveLength(1);
  });

  it('does not carry an event that names no destination', async () => {
    await publishingBus.publish(new UserRegisteredEvent('u-1', new Date()));
    await settle();

    expect(received.events).toHaveLength(0);
  });

  it('does not send back what it received: the origin mark cuts the loop', async () => {
    await publishingBus.publish(new PostPreCreatedEvent('p-6', 'not a boomerang', new Date()));
    await settle();
    const ingested = received.events.at(-1)!;
    arrivals.messages.length = 0;

    await consumingBus.publish(ingested);
    await settle();

    expect(arrivals.messages).toHaveLength(0);
  });

  it('sends an event of its own on the same destination, which is what proves the cut is about origin', async () => {
    await consumingBus.publish(new PostPreCreatedEvent('p-7', 'mine', new Date()));
    await settle();

    expect(arrivals.messages).toHaveLength(1);
    expect(arrivals.messages[0]).toBeInstanceOf(PostPreCreatedEvent);
  });
});
