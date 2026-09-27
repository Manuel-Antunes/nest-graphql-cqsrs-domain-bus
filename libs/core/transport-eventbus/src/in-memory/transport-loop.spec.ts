import type { MemoryServer } from '@camcima/nestjs-memory-microservices';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Controller, Injectable, Module } from '@nestjs/common';
import type { IEventHandler } from '@nestjs/cqrs';
import { AsyncContext, CqrsModule, EventsHandler } from '@nestjs/cqrs';
import { EventPattern, Payload } from '@nestjs/microservices';
import type { OutboxEnvelope } from '@nestjs/outbox';
import { ClientProxyTransport, OutboxModule } from '@nestjs/outbox';
import { ROOT_TENANT, TENANT_HEADER, Tenant } from '@nestposts/database';
import { testDatabaseConfig } from '@nestposts/database/testing';
import {
  MikroOrmOutboxModule,
  MikroOrmOutboxStore,
  MikroOrmUnitOfWorkTransaction,
  outboxEntities,
} from '@nestposts/outbox-mikro-orm';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { EventIngestion } from '../inbound/event-ingestion';
import { messageOf, reconstruct } from '../inbound/event-reconstruction';
import { routeOf } from '../outbound/event-messages';
import { TRANSPORT_ORIGIN } from '../outbound/message-headers';
import { OutboxPackets } from '../outbound/outbox-packets';
import type { Ingestion } from '../outbound/transport-metadata';
import { identifierOf } from '../outbound/transport-metadata';
import {
  CorrelatedRequestContext,
  TransportRequestContext,
} from '../request-context';
import type { InProcessService } from '../testing';
import { startInProcessService } from '../testing';
import { TransportEventBusModule } from '../transport-event-bus.module';
import { TransportEventBusService } from '../transport-event-bus.service';
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

const wire: {
  readonly toConsuming: MemoryServer[];
  readonly toPublishing: MemoryServer[];
} = {
  toConsuming: [],
  toPublishing: [],
};

class PublishingClient extends MemoryClient {}

class ConsumingClient extends MemoryClient {}

@Module({
  providers: [
    {
      provide: PublishingClient,
      useFactory: () =>
        new PublishingClient({ servers: () => wire.toConsuming }),
    },
  ],
  exports: [PublishingClient],
})
class PublishingClientModule {}

@Module({
  providers: [
    {
      provide: ConsumingClient,
      useFactory: () =>
        new ConsumingClient({ servers: () => wire.toPublishing }),
    },
  ],
  exports: [ConsumingClient],
})
class ConsumingClientModule {}

const draining = () => ({ relay: 'drain' as const });

@Injectable()
class Arrivals {
  readonly messages: object[] = [];
  readonly envelopes: Ingestion[] = [];
}

@Controller()
class ArrivalsController {
  constructor(private readonly arrivals: Arrivals) {}

  @EventPattern('posts.PostPreCreated.*')
  record(@Payload() envelope: OutboxEnvelope): void {
    this.arrivals.messages.push(reconstruct(envelope));
    this.arrivals.envelopes.push(messageOf(envelope));
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
  postPreCreated(@Payload() envelope: OutboxEnvelope): Promise<void> {
    return this.ingestion.ingest(envelope);
  }
}

describe('one hop between two services, over the in-process transport', () => {
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
    publishing = await startInProcessService({
      imports: [
        CqrsModule.forRoot(),
        MikroOrmModule.forRoot(
          testDatabaseConfig({
            entities: [...outboxEntities],
            allowGlobalContext: true,
          }),
        ),
        OutboxModule.forRoot({
          imports: [PublishingClientModule],
          transports: {
            [POSTS]: ClientProxyTransport(PublishingClient, {
              toPacket: OutboxPackets.memory,
            }),
          },
          route: routeOf,
          relay: { enabled: false },
        }),
        MikroOrmOutboxModule.forRoot({ producer: 'publishing-service' }),
        TransportEventBusModule.forRoot({
          identity: TransportIdentity.named('publishing-service'),
          requestContext: CorrelatedRequestContext,
          transaction: MikroOrmUnitOfWorkTransaction,
          outbox: { destinations: [POSTS], useFactory: draining },
        }),
      ],
      controllers: [ArrivalsController],
      providers: [Arrivals],
    });
    wire.toPublishing.push(publishing.server);

    consuming = await startInProcessService({
      imports: [
        CqrsModule.forRoot(),
        MikroOrmModule.forRoot(
          testDatabaseConfig({
            entities: [...outboxEntities],
            allowGlobalContext: true,
          }),
        ),
        OutboxModule.forRoot({
          imports: [ConsumingClientModule],
          transports: {
            [POSTS]: ClientProxyTransport(ConsumingClient, {
              toPacket: OutboxPackets.memory,
            }),
          },
          route: routeOf,
          relay: { enabled: false },
        }),
        MikroOrmOutboxModule.forRoot({ producer: 'consuming-service' }),
        TransportEventBusModule.forRoot({
          identity: TransportIdentity.named('consuming-service'),
          requestContext: CorrelatedRequestContext,
          transaction: MikroOrmUnitOfWorkTransaction,
          inbox: { descriptions: MikroOrmOutboxStore },
          outbox: { destinations: [POSTS], useFactory: draining },
        }),
      ],
      controllers: [PostEventsController],
      providers: [Received, PostPreCreatedHandler],
    });
    wire.toConsuming.push(consuming.server);

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
    arrivals.envelopes.length = 0;
    received.events.length = 0;
    received.contexts.length = 0;
  });

  it('binds each service to the routing keys it declared, and to nothing else', () => {
    expect(
      publishing.app.get(PublishingClient, { strict: false }).bindings(),
    ).toEqual(['posts.PostPreCreated.*']);
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
    expect((context as TransportRequestContext).attributes).toMatchObject({
      'post-id': 'p-2',
    });
  });

  it('keeps one correlation id for every event of one request', async () => {
    const request = new PostRequest('p-3');

    await publishingBus.publish(
      new PostPreCreatedEvent('p-3', 'first', new Date()),
      request,
    );
    await publishingBus.publish(
      new PostPreCreatedEvent('p-3', 'second', new Date()),
      request,
    );
    await settle();

    const [first, second] = received.contexts.slice(
      -2,
    ) as TransportRequestContext[];
    expect(first.correlationId).toBe(second.correlationId);
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

    it('the tenant the first service named arrives as an attribute of the restored context', async () => {
      const context = await tenanted('p-8', 'acme');

      expect(context.attributes).toMatchObject({
        [TENANT_HEADER]: 'acme',
        'post-id': 'p-8',
      });
    });

    it('and goes back out on the second service own event, without it having to know about tenants', async () => {
      const context = await tenanted('p-9', 'globex');
      arrivals.envelopes.length = 0;

      await consumingBus.publish(
        new PostPreCreatedEvent('p-9', 'decided', new Date()),
        context,
      );
      await settle();

      expect(arrivals.envelopes.at(-1)?.metadata).toMatchObject({
        [TENANT_HEADER]: 'globex',
      });
    });

    it('but the authorship does NOT: the second service publishes under its own name', async () => {
      const context = await tenanted('p-10', 'initech');
      arrivals.envelopes.length = 0;

      await consumingBus.publish(
        new PostPreCreatedEvent('p-10', 'decided', new Date()),
        context,
      );
      await settle();

      const metadata = arrivals.envelopes.at(-1)?.metadata ?? {};
      expect(metadata[TRANSPORT_ORIGIN]).toBe('consuming-service');
      expect(metadata[TRANSPORT_ORIGIN]).not.toBe('publishing-service');
    });

    it('a tenant nobody named crosses as the root one', async () => {
      expect(
        (await tenanted('p-11', ROOT_TENANT)).attributes[TENANT_HEADER],
      ).toBe(ROOT_TENANT);
    });

    it('the wire carries whatever the producer wrote — the reader is what normalizes it', async () => {
      const onTheWire = (await tenanted('p-12', 'undefined')).attributes[
        TENANT_HEADER
      ];

      expect(onTheWire).toBe('undefined');
      expect(Tenant.normalize(onTheWire)).toBe(ROOT_TENANT);
    });
  });
});
