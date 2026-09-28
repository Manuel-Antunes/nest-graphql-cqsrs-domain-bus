import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Controller, Injectable, Module } from '@nestjs/common';
import type { ICommandHandler, IEventHandler } from '@nestjs/cqrs';
import {
  AsyncContext,
  Command,
  CommandBus,
  CommandHandler,
  CqrsModule,
  EventsHandler,
} from '@nestjs/cqrs';
import type { ReadPacket } from '@nestjs/microservices';
import { EventPattern, Payload } from '@nestjs/microservices';
import type { OutboxEnvelope } from '@nestjs/outbox';
import { ClientProxyTransport, OutboxModule } from '@nestjs/outbox';
import { ROOT_TENANT, TENANT_HEADER, Tenant } from '@nestposts/database';
import {
  testDatabaseConfig,
  testSchemaLifecycle,
} from '@nestposts/database/testing';
import type { TopicMemoryServer } from '@nestposts/microservices-memory';
import {
  MikroOrmOutboxModule,
  MikroOrmOutboxStore,
  MikroOrmTransactionManager,
  outboxEntities,
} from '@nestposts/outbox-mikro-orm';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { EventIngestion } from '../inbound/event-ingestion';
import { EventMessage } from '../messaging/event-message';
import { EventMessages } from '../outbound/event-messages';
import { TRANSPORT_ORIGIN } from '../outbound/message-headers';
import { OutboxPackets } from '../outbound/outbox-packets';
import { OutboxRoute } from '../outbound/outbox-route';
import { identifierOf } from '../outbound/transport-metadata';
import {
  DefaultRequestContextCodec,
  TransportRequestContext,
} from '../request-context';
import type { InProcessService } from '../testing';
import { RecordingClient, startInProcessService } from '../testing';
import { TransportEventBusModule } from '../transport-event-bus.module';
import { TransportEventBusService } from '../transport-event-bus.service';
import { TransportIdentity } from '../transport-identity';

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
  constructor(
    readonly postId: string,
    readonly tenantId: string = ROOT_TENANT,
  ) {
    super();
  }

  toAttributes(): Record<string, string> {
    return { 'post-id': this.postId, [TENANT_HEADER]: this.tenantId };
  }
}

/**
 * A broker in this process: a client whose emits are delivered to the servers of the other side, so
 * the outbox's relay, its packets and its route are the production ones, end to end.
 */
class Wire extends RecordingClient {
  readonly to: TopicMemoryServer[] = [];

  protected override async dispatchEvent<T = unknown>(
    packet: ReadPacket,
  ): Promise<T> {
    for (const server of this.to) {
      await server.emit(String(packet.pattern), packet.data);
    }
    return undefined as T;
  }
}

class ToConsuming extends Wire {}

class ToPublishing extends Wire {}

const toConsuming = new ToConsuming();
const toPublishing = new ToPublishing();

@Module({
  providers: [
    { provide: ToConsuming, useValue: toConsuming },
    { provide: ToPublishing, useValue: toPublishing },
  ],
  exports: [ToConsuming, ToPublishing],
})
class WireModule {}

const publishingTransports = {
  [POSTS]: ClientProxyTransport(ToConsuming, {
    toPacket: OutboxPackets.inProcess,
  }),
};

const consumingTransports = {
  [POSTS]: ClientProxyTransport(ToPublishing, {
    toPacket: OutboxPackets.inProcess,
  }),
};

@Injectable()
class Arrivals {
  readonly messages: object[] = [];
  readonly headers: Record<string, string>[] = [];
}

@Controller()
class ArrivalsController {
  constructor(private readonly arrivals: Arrivals) {}

  @EventPattern('posts.PostPreCreated.*')
  record(@Payload() envelope: OutboxEnvelope): void {
    this.arrivals.messages.push(EventMessages.read(envelope).payload);
    this.arrivals.headers.push(envelope.headers as Record<string, string>);
  }
}

@Injectable()
class Received {
  readonly events: PostPreCreatedEvent[] = [];
  readonly contexts: (AsyncContext | undefined)[] = [];
  readonly messages: EventMessage[] = [];
}

@EventsHandler(PostPreCreatedEvent)
class PostPreCreatedHandler implements IEventHandler<PostPreCreatedEvent> {
  constructor(private readonly received: Received) {}

  handle(event: PostPreCreatedEvent): void {
    this.received.events.push(event);
    this.received.contexts.push(AsyncContext.of(event));
    this.received.messages.push(EventMessage.of(event));
  }
}

@Controller()
class PostEventsController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern('posts.PostPreCreated.*')
  postPreCreated(@Payload() envelope: OutboxEnvelope): Promise<void> {
    return this.ingestion.ingest(envelope);
  }
}

class PublishTwice extends Command<void> {
  constructor(readonly postId: string) {
    super();
  }
}

@CommandHandler(PublishTwice)
class PublishTwiceHandler implements ICommandHandler<PublishTwice> {
  constructor(private readonly bus: TransportEventBusService) {}

  async execute({ postId }: PublishTwice): Promise<void> {
    await this.bus.publish(
      new PostPreCreatedEvent(postId, 'first', new Date()),
    );
    await this.bus.publish(
      new PostPreCreatedEvent(postId, 'second', new Date()),
    );
  }
}

describe('one hop between two services, with no broker between them', () => {
  let publishing: InProcessService;
  let consuming: InProcessService;
  let publishingBus: TransportEventBusService;
  let consumingBus: TransportEventBusService;
  let arrivals: Arrivals;
  let received: Received;
  let inbox: MikroOrmOutboxStore;

  const settle = async () => {
    for (let turn = 0; turn < 20; turn++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  beforeAll(async () => {
    publishing = await startInProcessService(
      {
        imports: [
          CqrsModule.forRoot(),
          MikroOrmModule.forRoot(
            testDatabaseConfig({
              entities: [...outboxEntities],
              allowGlobalContext: true,
            }),
          ),
          OutboxModule.forRoot({
            imports: [WireModule],
            transports: publishingTransports,
            route: OutboxRoute.over(publishingTransports),
            relay: { enabled: false },
          }),
          MikroOrmOutboxModule.forRoot({ producer: 'publishing-service' }),
          TransportEventBusModule.forRoot({
            identity: TransportIdentity.named('publishing-service'),
            requestContext: DefaultRequestContextCodec,
            transactionManager: MikroOrmTransactionManager,
            outbox: {
              destinations: [POSTS],
              useFactory: () => ({
                relay: 'drain',
                route: OutboxRoute.over(publishingTransports),
              }),
            },
          }),
        ],
        controllers: [ArrivalsController],
        providers: [Arrivals, PublishTwiceHandler],
      },
      testSchemaLifecycle,
    );
    toPublishing.to.push(publishing.server);

    consuming = await startInProcessService(
      {
        imports: [
          CqrsModule.forRoot(),
          MikroOrmModule.forRoot(
            testDatabaseConfig({
              entities: [...outboxEntities],
              allowGlobalContext: true,
            }),
          ),
          OutboxModule.forRoot({
            imports: [WireModule],
            transports: consumingTransports,
            route: OutboxRoute.over(consumingTransports),
            relay: { enabled: false },
          }),
          MikroOrmOutboxModule.forRoot({ producer: 'consuming-service' }),
          TransportEventBusModule.forRoot({
            identity: TransportIdentity.named('consuming-service'),
            requestContext: DefaultRequestContextCodec,
            transactionManager: MikroOrmTransactionManager,
            inbox: { descriptions: MikroOrmOutboxStore },
            outbox: {
              destinations: [POSTS],
              useFactory: () => ({
                relay: 'drain',
                route: OutboxRoute.over(consumingTransports),
              }),
            },
          }),
        ],
        controllers: [PostEventsController],
        providers: [Received, PostPreCreatedHandler],
      },
      testSchemaLifecycle,
    );
    toConsuming.to.push(consuming.server);

    publishingBus = publishing.app.get(TransportEventBusService);
    consumingBus = consuming.app.get(TransportEventBusService);
    arrivals = publishing.app.get(Arrivals);
    received = consuming.app.get(Received);
    inbox = consuming.app.get(MikroOrmOutboxStore);
  });

  afterAll(async () => {
    await publishing.close();
    await consuming.close();
  });

  beforeEach(() => {
    arrivals.messages.length = 0;
    arrivals.headers.length = 0;
    received.events.length = 0;
    received.contexts.length = 0;
    received.messages.length = 0;
  });

  it('binds each service to the routing keys it declared, and to nothing else', () => {
    expect(publishing.server.bindings()).toEqual(['posts.PostPreCreated.*']);
  });

  it('carries the event across as an instance of the real class, fields and dates intact', async () => {
    await publishingBus.publish(
      new PostPreCreatedEvent(
        'p-1',
        'Nest + GraphQL',
        new Date('2026-09-08T12:00:00.000Z'),
      ),
    );
    await settle();

    expect(received.events).toHaveLength(1);
    expect(received.events[0]).toBeInstanceOf(PostPreCreatedEvent);
    expect(received.events[0]).toMatchObject({
      postId: 'p-1',
      title: 'Nest + GraphQL',
    });
    expect(received.events[0].occurredAt).toEqual(
      new Date('2026-09-08T12:00:00.000Z'),
    );
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
    expect((context as TransportRequestContext).metadata).toMatchObject({
      'post-id': 'p-2',
    });
  });

  it('keeps one correlation id for every event of one command, across the hop', async () => {
    await publishing.app.get(CommandBus).execute(new PublishTwice('p-3'));
    await settle();

    const [first, second] = received.messages.slice(-2);
    expect(first.metadata.correlationId).toBeDefined();
    expect(first.metadata.correlationId).toBe(second.metadata.correlationId);
  });

  it('remembers each message under the name of the service that consumed it', async () => {
    const event = new PostPreCreatedEvent('p-4', 'remembered', new Date());
    await publishingBus.publish(event);
    await settle();

    await expect(inbox.processedBy('consuming-service')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ messageId: identifierOf(event) }),
      ]),
    );
  });

  it('delivers a redelivery of the same message to nobody', async () => {
    const event = new PostPreCreatedEvent(
      'p-5',
      'twice on the wire',
      new Date(),
    );

    await publishingBus.publish(event);
    await publishingBus.publish(event);
    await settle();

    expect(received.events).toHaveLength(1);
  });

  it('does not carry an event whose namespace has no destination', async () => {
    await publishingBus.publish(new UserRegisteredEvent('u-1', new Date()));
    await settle();

    expect(received.events).toHaveLength(0);
  });

  it('does not send back what it received: the origin mark cuts the loop', async () => {
    await publishingBus.publish(
      new PostPreCreatedEvent('p-6', 'not a boomerang', new Date()),
    );
    await settle();
    const ingested = received.events.at(-1)!;
    arrivals.messages.length = 0;

    await consumingBus.publish(ingested);
    await settle();

    expect(arrivals.messages).toHaveLength(0);
  });

  it('sends an event of its own on the same destination, which is what proves the cut is about origin', async () => {
    await consumingBus.publish(
      new PostPreCreatedEvent('p-7', 'mine', new Date()),
    );
    await settle();

    expect(arrivals.messages).toHaveLength(1);
    expect(arrivals.messages[0]).toBeInstanceOf(PostPreCreatedEvent);
  });

  describe('what the request carries survives the hop, and the hop back', () => {
    const tenanted = async (postId: string, tenantId: string) => {
      await publishingBus.publish(
        new PostPreCreatedEvent(postId, 'tenanted', new Date()),
        new PostRequest(postId, tenantId),
      );
      await settle();
      return received.contexts.at(-1) as TransportRequestContext;
    };
    const tenantOf = (context: TransportRequestContext) =>
      context.metadata[TENANT_HEADER];

    it('the tenant the first service named arrives as an attribute of the restored context', async () => {
      const context = await tenanted('p-8', 'acme');

      expect(context.metadata).toMatchObject({
        [TENANT_HEADER]: 'acme',
        'post-id': 'p-8',
      });
    });

    it('and goes back out on the second service own event, without it having to know about tenants', async () => {
      const context = await tenanted('p-9', 'globex');
      arrivals.headers.length = 0;

      await consumingBus.publish(
        new PostPreCreatedEvent('p-9', 'decided', new Date()),
        context,
      );
      await settle();

      expect(arrivals.headers.at(-1)).toMatchObject({
        [TENANT_HEADER]: 'globex',
      });
    });

    it('but the authorship does NOT: the second service publishes under its own name', async () => {
      const context = await tenanted('p-10', 'initech');
      arrivals.headers.length = 0;

      await consumingBus.publish(
        new PostPreCreatedEvent('p-10', 'decided', new Date()),
        context,
      );
      await settle();

      const metadata = arrivals.headers.at(-1) ?? {};
      expect(metadata[TRANSPORT_ORIGIN]).toBe('consuming-service');
      expect(metadata[TRANSPORT_ORIGIN]).not.toBe('publishing-service');
    });

    it('a tenant nobody named crosses as the root one', async () => {
      expect(tenantOf(await tenanted('p-11', ROOT_TENANT))).toBe(ROOT_TENANT);
    });

    it('the wire carries whatever the producer wrote — the reader is what normalizes it', async () => {
      const onTheWire = tenantOf(await tenanted('p-12', 'undefined'));

      expect(onTheWire).toBe('undefined');
      expect(Tenant.normalize(onTheWire)).toBe(ROOT_TENANT);
    });
  });
});
