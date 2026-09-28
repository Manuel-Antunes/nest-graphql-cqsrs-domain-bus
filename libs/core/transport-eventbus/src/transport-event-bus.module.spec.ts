import { MikroORM } from '@mikro-orm/core';
import type { ModuleMetadata } from '@nestjs/common';
import { Injectable, Module } from '@nestjs/common';
import { AsyncContext, CqrsModule } from '@nestjs/cqrs';
import {
  ClientProxyTransport,
  OutboxInbox,
  OutboxModule,
  OutboxRelay,
} from '@nestjs/outbox';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DatabaseModule, inRequestContext } from '@nestposts/database';
import {
  TestSchemaModule,
  testDatabaseConfig,
} from '@nestposts/database/testing';
import {
  MikroOrmEventStorageEngine,
  MikroOrmEventStoreModule,
} from '@nestposts/event-store-mikro-orm';
import {
  MikroOrmOutboxModule,
  MikroOrmOutboxStore,
  MikroOrmTransactionManager,
} from '@nestposts/outbox-mikro-orm';
import { AggregateRoot } from '@nestposts/platform/domain/shared/aggregate-root';
import { BaseEntity } from '@nestposts/platform/domain/shared/base-entity';
import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import {
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TRANSPORT_OUTBOX_DESTINATIONS,
} from './constants';
import { EventSourcingRepository } from './eventsourcing/event-sourcing.repository';
import { EventStore } from './eventsourcing/event-store';
import { EventIngestion } from './inbound/event-ingestion';
import { InboxDescriptions } from './inbound/inbox-descriptions';
import { IncomingRequest } from './inbound/incoming-request';
import { EventMessage } from './messaging/event-message';
import type { Message } from './messaging/message';
import { OutboxRoute } from './outbound/outbox-route';
import { EventOutbox } from './outbox/event-outbox';
import {
  DefaultRequestContextCodec,
  RequestContextCodec,
} from './request-context';
import { InProcessPacket } from './testing/in-process-packet';
import { RecordingClient } from './testing/recording-client';
import { TransportEventBusModule } from './transport-event-bus.module';
import { TransportEventBusService } from './transport-event-bus.service';
import { TransportIdentity } from './transport-identity';
import { TransactionManager } from './unit-of-work/transaction-manager';
import { UnitOfWorkCommands } from './unit-of-work/unit-of-work-commands';
import { UnitOfWorkFactory } from './unit-of-work/unit-of-work-factory';

@EventType({ namespace: 'things', tags: ['thingId'] })
class ThingHappenedEvent implements DomainEvent {
  constructor(
    readonly thingId: string,
    readonly occurredAt: Date,
  ) {}
}

class ThingId {
  constructor(readonly value: string) {}

  equals(other: unknown): boolean {
    return other instanceof ThingId && other.value === this.value;
  }
}

class Thing extends AggregateRoot(BaseEntity) {
  id!: ThingId;

  onThingHappenedEvent(event: ThingHappenedEvent): void {
    this.id = new ThingId(event.thingId);
  }
}

class ThingsClient extends RecordingClient {}

@Module({
  providers: [{ provide: ThingsClient, useValue: new ThingsClient() }],
  exports: [ThingsClient],
})
class ThingsClientModule {}

const thingsOutbox = {
  destinations: ['things'],
  useFactory: () => ({ relay: 'off' as const }),
};

@Injectable()
class MyRequestCodec extends DefaultRequestContextCodec {
  protected override contextFor(_message: Message): AsyncContext | undefined {
    return undefined;
  }
}

/** The application's connection. Every table reaches it through the module that owns it. */
const persistence = () => [
  DatabaseModule.forRoot(testDatabaseConfig({ allowGlobalContext: true })),
  TestSchemaModule.forRoot(),
];

/** The application's outbox, declared at its root the way an application declares it. */
const transports = {
  things: ClientProxyTransport(ThingsClient, {
    toPacket: InProcessPacket.of,
  }),
};

const outbox = (producer: string) => [
  OutboxModule.forRoot({
    imports: [ThingsClientModule],
    transports,
    route: OutboxRoute.over(transports),
    relay: { enabled: false },
  }),
  MikroOrmOutboxModule.forRoot({ producer }),
];

describe('TransportEventBusModule', () => {
  let module: TestingModule;

  afterEach(async () => module?.close());

  const bootstrap = async (imports: NonNullable<ModuleMetadata['imports']>) => {
    module = await Test.createTestingModule({
      imports: [CqrsModule.forRoot(), ...imports],
    }).compile();
    await module.init();
    return module;
  };

  describe('forRoot', () => {
    it('gives a publish-only service the bus, the publisher and a request codec, and no ingestion', async () => {
      const app = await bootstrap([
        TransportEventBusModule.forRoot({ identity: 'things-api' }),
      ]);

      expect(app.get(TransportEventBusService)).toBeDefined();
      expect(app.get(TRANSPORT_EVENT_BUS_PUBLISHER)).toBeDefined();
      expect(app.get(RequestContextCodec)).toBeInstanceOf(
        DefaultRequestContextCodec,
      );
      expect(() => app.get(EventIngestion)).toThrow();
    });

    it('runs every command in a unit of work, without a transaction until the application names one', async () => {
      const app = await bootstrap([
        TransportEventBusModule.forRoot({ identity: 'things-api' }),
      ]);

      expect(app.get(UnitOfWorkCommands)).toBeInstanceOf(UnitOfWorkCommands);
      expect(app.get(UnitOfWorkFactory)).toBeInstanceOf(UnitOfWorkFactory);
      expect(() => app.get(TransactionManager)).toThrow();
    });

    it('runs them in the transaction the application names, for its ORM', async () => {
      const app = await bootstrap([
        ...persistence(),
        ...outbox('things-api'),
        TransportEventBusModule.forRoot({
          identity: 'things-api',
          transactionManager: MikroOrmTransactionManager,
        }),
      ]);

      expect(app.get(TransactionManager)).toBeInstanceOf(TransactionManager);
      expect(app.get(TransactionManager).requiresSequentialInvocation).toBe(
        true,
      );
    });

    it('publishes the namespaces it was given destinations for, and nothing else', async () => {
      const app = await bootstrap([
        ...persistence(),
        ...outbox('things-api'),
        TransportEventBusModule.forRoot({
          identity: 'things-api',
          transactionManager: MikroOrmTransactionManager,
          outbox: thingsOutbox,
        }),
      ]);

      expect(app.get(TRANSPORT_OUTBOX_DESTINATIONS)).toEqual(['things']);
    });

    it('takes the name as the identity, and an identity of its own when there is one', async () => {
      const named = await bootstrap([
        TransportEventBusModule.forRoot({ identity: 'things-api' }),
      ]);
      expect(named.get(TransportIdentity)).toMatchObject({
        applicationName: 'things-api',
        publishes: true,
      });
      await named.close();

      const silent = await bootstrap([
        TransportEventBusModule.forRoot({
          identity: TransportIdentity.silent('a-suite'),
        }),
      ]);
      expect(silent.get(TransportIdentity)).toMatchObject({
        applicationName: 'a-suite',
        publishes: false,
      });
    });

    it('turns the outbound half off from the options too', async () => {
      const app = await bootstrap([
        TransportEventBusModule.forRoot({
          identity: 'things-api',
          publishes: false,
        }),
      ]);

      expect(app.get(TransportIdentity).publishes).toBe(false);
    });

    it("takes the application's own request codec", async () => {
      const app = await bootstrap([
        TransportEventBusModule.forRoot({
          identity: 'things-api',
          requestContext: MyRequestCodec,
        }),
      ]);

      expect(app.get(RequestContextCodec)).toBeInstanceOf(MyRequestCodec);
    });

    it("turns receiving on with an inbox, over the application's outbox, and exports what a controller and a guard inject", async () => {
      const app = await bootstrap([
        ...persistence(),
        ...outbox('things-api'),
        TransportEventBusModule.forRoot({
          identity: 'things-api',
          transactionManager: MikroOrmTransactionManager,
          inbox: true,
        }),
      ]);

      expect(app.get(EventIngestion)).toBeInstanceOf(EventIngestion);
      expect(app.get(OutboxInbox)).toBeInstanceOf(OutboxInbox);
      expect(app.get(IncomingRequest)).toBeInstanceOf(IncomingRequest);
      expect(() => app.get(InboxDescriptions)).toThrow();
      expect(() => app.get(EventOutbox)).toThrow();
    });

    it('describes what the inbox admitted where the application says', async () => {
      const app = await bootstrap([
        ...persistence(),
        ...outbox('things-api'),
        TransportEventBusModule.forRoot({
          identity: 'things-api',
          transactionManager: MikroOrmTransactionManager,
          inbox: { descriptions: MikroOrmOutboxStore },
        }),
      ]);

      expect(app.get(InboxDescriptions)).toBe(app.get(MikroOrmOutboxStore));
    });

    it("refuses to receive without the application's outbox, rather than keep no inbox", async () => {
      await expect(
        bootstrap([
          ...persistence(),
          TransportEventBusModule.forRoot({
            identity: 'things-api',
            transactionManager: MikroOrmTransactionManager,
            inbox: true,
          }),
        ]),
      ).rejects.toThrow(/OutboxInbox/);
    });

    it("keeps an outbox on request, writing to the application's, whose relay it does not start", async () => {
      const app = await bootstrap([
        ...persistence(),
        ...outbox('things-api'),
        TransportEventBusModule.forRoot({
          identity: 'things-api',
          transactionManager: MikroOrmTransactionManager,
          outbox: thingsOutbox,
        }),
      ]);

      expect(app.get(EventOutbox)).toBeInstanceOf(EventOutbox);
      expect(app.get(OutboxRelay).running).toBe(false);
      expect(() => app.get(EventIngestion)).toThrow();
    });

    it("wires the event store on the application's engine, and a repository per entity", async () => {
      const app = await bootstrap([
        ...persistence(),
        MikroOrmEventStoreModule,
        TransportEventBusModule.forRoot({
          identity: 'tagging',
          eventStore: {
            engine: MikroOrmEventStorageEngine,
            entities: [{ entity: Thing, tagKey: 'thingId' }],
          },
        }),
      ]);

      expect(app.get(EventStore)).toBeInstanceOf(EventStore);
      expect(app.get(EventSourcingRepository)).toBeInstanceOf(
        EventSourcingRepository,
      );
    });

    it('appends through the engine and replays an entity from what it appended', async () => {
      const app = await bootstrap([
        ...persistence(),
        MikroOrmEventStoreModule,
        TransportEventBusModule.forRoot({
          identity: 'tagging',
          eventStore: {
            engine: MikroOrmEventStorageEngine,
            entities: [{ entity: Thing, tagKey: 'thingId' }],
          },
        }),
      ]);
      const em = app.get(MikroORM).em;

      const replayed = await inRequestContext(em, async () => {
        await app
          .get(EventStore)
          .append(undefined, [
            EventMessage.of(
              new ThingHappenedEvent(
                'thing-1',
                new Date('2026-09-08T12:00:00.000Z'),
              ),
            ),
          ]);
        return app
          .get<EventSourcingRepository<Thing>>(EventSourcingRepository)
          .load('thing-1');
      });

      expect(replayed).toBeInstanceOf(Thing);
    });

    it('refuses a streaming processing group without the outbox it is delivered through', async () => {
      expect(() =>
        TransportEventBusModule.forRoot({
          identity: 'tagging',
          processingGroups: { mailing: 'streaming' },
        }),
      ).toThrow(/delivered through the outbox/);
    });

    it('refuses subscriptions without the event store they read', async () => {
      expect(() =>
        TransportEventBusModule.forRoot({
          identity: 'posts-api',
          subscriptions: true,
        }),
      ).toThrow(/read the event store/);
    });
  });

  describe('forRootAsync', () => {
    const CONFIG = 'CONFIG';

    it('resolves the identity from whatever the application injects, once', async () => {
      let calls = 0;
      const app = await bootstrap([
        TransportEventBusModule.forRootAsync({
          imports: [
            {
              module: class ConfigStub {},
              providers: [
                { provide: CONFIG, useValue: { name: 'from-config' } },
              ],
              exports: [CONFIG],
            },
          ],
          inject: [CONFIG],
          useFactory: async (config: { name: string }) => {
            calls += 1;
            return { identity: config.name, publishes: false };
          },
        }),
      ]);

      expect(app.get(TransportIdentity)).toMatchObject({
        applicationName: 'from-config',
        publishes: false,
      });
      expect(calls).toBe(1);
    });

    it('takes a name, or an identity, straight from the factory', async () => {
      const app = await bootstrap([
        TransportEventBusModule.forRootAsync({
          useFactory: () => TransportIdentity.silent('a-suite'),
        }),
      ]);

      expect(app.get(TransportIdentity)).toMatchObject({
        applicationName: 'a-suite',
        publishes: false,
      });
    });

    it('wires the same mechanism as forRoot around it', async () => {
      const app = await bootstrap([
        ...persistence(),
        ...outbox('tagging'),
        MikroOrmEventStoreModule,
        TransportEventBusModule.forRootAsync({
          useFactory: () => 'tagging',
          transactionManager: MikroOrmTransactionManager,
          inbox: true,
          outbox: thingsOutbox,
          eventStore: {
            engine: MikroOrmEventStorageEngine,
            entities: [{ entity: Thing, tagKey: 'thingId' }],
          },
        }),
      ]);

      expect(app.get(EventIngestion)).toBeInstanceOf(EventIngestion);
      expect(app.get(EventStore)).toBeDefined();
      expect(app.get(TRANSPORT_OUTBOX_DESTINATIONS)).toEqual(['things']);
    });
  });
});
