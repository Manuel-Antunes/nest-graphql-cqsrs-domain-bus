import { MikroORM } from '@mikro-orm/core';
import type { ModuleMetadata } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { AsyncContext, CqrsModule } from '@nestjs/cqrs';
import type { ClientProxy } from '@nestjs/microservices';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DatabaseModule, inRequestContext } from '@nestposts/database';
import {
  TestSchemaModule,
  testDatabaseConfig,
} from '@nestposts/database/testing';
import { AggregateRoot } from '@nestposts/platform/domain/shared/aggregate-root';
import { BaseEntity } from '@nestposts/platform/domain/shared/base-entity';
import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import {
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TRANSPORT_EVENT_BUS_SERVICE,
} from './constants';
import { Publisher } from './decorators/publisher.decorator';
import { EventIngestion } from './inbound/event-ingestion';
import { IncomingRequest } from './inbound/incoming-request';
import { OutboxRouting } from './outbound/outbox-routing';
import type { Ingestion } from './outbound/transport-metadata';
import { EventLog } from './persistence/event-log/event-log';
import { EventSourcedRepository } from './persistence/event-log/event-sourced.repository';
import {
  MessageInbox,
  MikroOrmMessageInbox,
  NoMessageInbox,
} from './persistence/message-inbox';
import {
  CorrelatedRequestContext,
  RequestContextCodec,
} from './request-context';
import { RecordingClient } from './testing/recording-client';
import { TransportEventBusModule } from './transport-event-bus.module';
import { TransportIdentity } from './transport-identity';

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

@Injectable()
@Publisher('things')
class ThingsPublisher {
  readonly client: ClientProxy = new RecordingClient();
}

@Injectable()
class MyRequestCodec extends CorrelatedRequestContext {
  protected override contextFor(_message: Ingestion): AsyncContext | undefined {
    return undefined;
  }
}

/** The application's connection. Every table reaches it through the module that owns it. */
const persistence = () => [
  DatabaseModule.forRoot(testDatabaseConfig({ allowGlobalContext: true })),
  TestSchemaModule.forRoot(),
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
        TransportEventBusModule.forRoot({
          identity: 'things-api',
          publishers: [ThingsPublisher],
        }),
      ]);

      expect(app.get(TRANSPORT_EVENT_BUS_SERVICE)).toBeDefined();
      expect(app.get(TRANSPORT_EVENT_BUS_PUBLISHER)).toBeDefined();
      expect(app.get(RequestContextCodec)).toBeInstanceOf(
        CorrelatedRequestContext,
      );
      expect(() => app.get(EventIngestion)).toThrow();
    });

    it('registers the destinations it was given, so the routing table answers for them', async () => {
      const app = await bootstrap([
        TransportEventBusModule.forRoot({
          identity: 'things-api',
          publishers: [ThingsPublisher],
        }),
      ]);

      expect(app.get(OutboxRouting).describe()).toEqual([
        'ThingsPublisher ← [things]',
      ]);
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

    it('turns receiving on with an inbox, and exports what a controller and a guard inject', async () => {
      const app = await bootstrap([
        ...persistence(),
        TransportEventBusModule.forRoot({
          identity: 'things-api',
          inbox: NoMessageInbox,
        }),
      ]);

      expect(app.get(EventIngestion)).toBeInstanceOf(EventIngestion);
      expect(app.get(MessageInbox)).toBeInstanceOf(NoMessageInbox);
      expect(app.get(IncomingRequest)).toBeInstanceOf(IncomingRequest);
    });

    it('wires the event log and a repository per aggregate', async () => {
      const app = await bootstrap([
        ...persistence(),
        TransportEventBusModule.forRoot({
          identity: 'tagging',
          inbox: MikroOrmMessageInbox,
          eventStore: [Thing],
        }),
      ]);

      expect(app.get(EventLog)).toBeDefined();
      expect(app.get(EventSourcedRepository)).toBeInstanceOf(
        EventSourcedRepository,
      );
    });

    it('brings the tables the library needs, which the application never listed', async () => {
      const app = await bootstrap([
        ...persistence(),
        TransportEventBusModule.forRoot({
          identity: 'tagging',
          inbox: MikroOrmMessageInbox,
          eventStore: [Thing],
        }),
      ]);
      const em = app.get(MikroORM).em;

      const remembered = await inRequestContext(em, async () => {
        await app
          .get(MessageInbox)
          .register('evt-1', 'things.ThingHappened#1.0.0', 'elsewhere');
        return app.get(MessageInbox).received();
      });
      const replayed = await inRequestContext(em, async () => {
        await app
          .get(EventLog)
          .append(
            [
              new ThingHappenedEvent(
                'thing-1',
                new Date('2026-09-08T12:00:00.000Z'),
              ),
            ],
            'thing-1',
          );
        return app
          .get<EventSourcedRepository<Thing>>(EventSourcedRepository)
          .load('thing-1');
      });

      expect(remembered).toHaveLength(1);
      expect(replayed).toBeInstanceOf(Thing);
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
          publishers: [ThingsPublisher],
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
        TransportEventBusModule.forRootAsync({
          useFactory: () => 'tagging',
          inbox: MikroOrmMessageInbox,
          eventStore: [Thing],
          publishers: [ThingsPublisher],
        }),
      ]);

      expect(app.get(EventIngestion)).toBeInstanceOf(EventIngestion);
      expect(app.get(EventLog)).toBeDefined();
      expect(app.get(OutboxRouting).describe()).toEqual([
        'ThingsPublisher ← [things]',
      ]);
    });
  });
});
