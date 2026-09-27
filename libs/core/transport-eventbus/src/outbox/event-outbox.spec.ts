import { defineEntity, EntityManager, MikroORM, p } from '@mikro-orm/core';
import { Injectable, Module } from '@nestjs/common';
import type { ICommandHandler, IEventHandler } from '@nestjs/cqrs';
import {
  AggregateRoot,
  Command,
  CommandBus,
  CommandHandler,
  EventPublisher,
  EventsHandler,
} from '@nestjs/cqrs';
import type { ReadPacket } from '@nestjs/microservices';
import type { OutboxEnvelope } from '@nestjs/outbox';
import {
  ClientProxyTransport,
  OutboxModule,
  OutboxRelay,
} from '@nestjs/outbox';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule, inRequestContext } from '@nestposts/database';
import {
  TestSchemaModule,
  testDatabaseConfig,
} from '@nestposts/database/testing';
import {
  MikroOrmOutboxModule,
  MikroOrmUnitOfWorkTransaction,
} from '@nestposts/outbox-mikro-orm';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { TRANSPORT_EVENT_BUS_PUBLISHER } from '../constants';
import { OutboxPackets } from '../outbound/outbox-packets';
import { OutboxRoute } from '../outbound/outbox-route';
import { identifierOf } from '../outbound/transport-metadata';
import { RecordingClient } from '../testing/recording-client';
import { TransportEventBusModule } from '../transport-event-bus.module';
import type { OutboxRelayMode } from './transport-outbox.options';

@EventType({ namespace: 'things', tags: ['thingId'] })
class ThingHappenedEvent {
  constructor(
    readonly thingId: string,
    readonly occurredAt: Date,
  ) {}
}

class ThingRecord {
  constructor(readonly id: string) {}
}

const ThingRecordSchema = defineEntity({
  class: ThingRecord,
  tableName: 'things',
  properties: { id: p.string().primary() },
});

class Thing extends AggregateRoot {
  happen(thingId: string): void {
    this.apply(new ThingHappenedEvent(thingId, new Date()));
  }
}

class DoThing extends Command<void> {
  constructor(
    readonly thingId: string,
    readonly refuse = false,
  ) {
    super();
  }
}

@CommandHandler(DoThing)
class DoThingHandler implements ICommandHandler<DoThing> {
  constructor(
    private readonly em: EntityManager,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ thingId, refuse }: DoThing): Promise<void> {
    await this.em.persist(new ThingRecord(thingId)).flush();
    const thing = this.publisher.mergeObjectContext(new Thing());
    thing.happen(thingId);
    thing.commit();
    if (refuse) {
      throw new Error('the command refused after it had published');
    }
  }
}

class Broker extends RecordingClient {
  down = false;

  protected override async dispatchEvent<T = unknown>(
    packet: ReadPacket,
  ): Promise<T> {
    if (this.down) {
      throw new Error('the broker is down');
    }
    return super.dispatchEvent(packet);
  }
}

const broker = new Broker();

@Module({
  providers: [{ provide: Broker, useValue: broker }],
  exports: [Broker],
})
class BrokerModule {}

const transports = {
  things: ClientProxyTransport(Broker, { toPacket: OutboxPackets.inProcess }),
};

@Injectable()
class Told {
  readonly things: { thingId: string; visible: boolean }[] = [];
}

@EventsHandler(ThingHappenedEvent)
class TellThings implements IEventHandler<ThingHappenedEvent> {
  constructor(
    private readonly told: Told,
    private readonly orm: MikroORM,
  ) {}

  async handle(event: ThingHappenedEvent): Promise<void> {
    const elsewhere = this.orm.em.fork({ disableContextResolution: true });
    const row = await elsewhere.findOne(ThingRecord, { id: event.thingId });
    this.told.things.push({ thingId: event.thingId, visible: row !== null });
  }
}

describe('the outbox, as the transport bus writes it', () => {
  let module: TestingModule;

  const boot = async (relay: OutboxRelayMode) => {
    module = await Test.createTestingModule({
      imports: [
        CqsrsModule.forRoot({
          aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER,
        }),
        DatabaseModule.forRoot(
          testDatabaseConfig({
            entities: [ThingRecordSchema],
            allowGlobalContext: true,
          }),
        ),
        TestSchemaModule.forRoot(),
        OutboxModule.forRoot({
          imports: [BrokerModule],
          transports,
          route: OutboxRoute.over(transports),
          relay: { enabled: relay === 'poll', pollInterval: '1s' },
          retry: { attempts: 3, backoff: { delay: 1, jitter: 'none' } },
        }),
        MikroOrmOutboxModule.forRoot({ producer: 'things-api' }),
        TransportEventBusModule.forRoot({
          identity: 'things-api',
          transaction: MikroOrmUnitOfWorkTransaction,
          outbox: {
            destinations: ['things'],
            useFactory: () => ({ relay }),
          },
        }),
      ],
      providers: [DoThingHandler, TellThings, Told],
    }).compile();
    await module.init();
    return module;
  };

  const execute = (command: DoThing) => module.get(CommandBus).execute(command);
  const stats = () => module.get(OutboxRelay).stats();
  const told = () => module.get(Told).things;
  const thingsIn = async () =>
    (await module.get(MikroORM).em.fork().find(ThingRecord, {})).map(
      (thing) => thing.id,
    );
  const published = () =>
    broker.sent.map((message) => (message.data as OutboxEnvelope).id);

  beforeEach(() => {
    broker.clear();
    broker.down = false;
  });

  afterEach(async () => {
    await module?.close();
  });

  describe('with no relay in this process', () => {
    beforeEach(() => boot('off'));

    it('commits the event with the writes that raised it, and sends nothing itself', async () => {
      await execute(new DoThing('t-1'));

      expect(await thingsIn()).toEqual(['t-1']);
      expect(await stats()).toMatchObject({ pending: 1, ready: 1 });
      expect(broker.sent).toHaveLength(0);
    });

    it('is published by the relay, under the routing key and with the identifier it was raised with', async () => {
      await execute(new DoThing('t-2'));

      await expect(module.get(OutboxRelay).runOnce()).resolves.toMatchObject({
        published: 1,
      });

      expect(broker.patterns()).toEqual(['things.ThingHappened.t-2']);
      expect(published()[0]).toMatch(/^[0-9a-f-]{36}$/);
      expect(await stats()).toMatchObject({ pending: 0 });
    });

    it('discards the event with a command that failed after publishing it', async () => {
      await expect(execute(new DoThing('t-3', true))).rejects.toThrow(
        'the command refused',
      );

      expect(await thingsIn()).toEqual([]);
      expect(await stats()).toMatchObject({ pending: 0 });
      expect(told()).toEqual([]);
    });

    it('tells this process only once the writes are visible to everybody', async () => {
      await execute(new DoThing('t-4'));

      await expect
        .poll(() => told(), { timeout: 500, interval: 10 })
        .toEqual([{ thingId: 't-4', visible: true }]);
    });

    it('keeps the event while the broker is down, and publishes it once it is back', async () => {
      await execute(new DoThing('t-5'));
      broker.down = true;

      await expect(module.get(OutboxRelay).runOnce()).resolves.toMatchObject({
        retried: 1,
      });
      expect(await stats()).toMatchObject({ pending: 1, deadLetters: 0 });

      broker.down = false;
      await new Promise((resolve) => setTimeout(resolve, 5));
      await expect(module.get(OutboxRelay).runOnce()).resolves.toMatchObject({
        published: 1,
      });
      expect(broker.patterns()).toEqual(['things.ThingHappened.t-5']);
    });

    it('publishes an event raised with no command around it, in a unit of its own', async () => {
      const thing = module
        .get<EventPublisher>(TRANSPORT_EVENT_BUS_PUBLISHER)
        .mergeObjectContext(new Thing());
      thing.happen('t-6');
      const event = thing.getUncommittedEvents()[0];
      thing.commit();

      await expect
        .poll(async () => (await stats()).pending, {
          timeout: 500,
          interval: 10,
        })
        .toBe(1);
      await module.get(OutboxRelay).runOnce();
      expect(published()).toEqual([identifierOf(event)]);
    });

    it("records a publish nobody awaited inside somebody else's transaction in a transaction of its own", async () => {
      const em = module.get(MikroORM).em;

      await inRequestContext(em, () =>
        em.transactional(async () => {
          const thing = module
            .get<EventPublisher>(TRANSPORT_EVENT_BUS_PUBLISHER)
            .mergeObjectContext(new Thing());
          thing.happen('t-10');
          thing.commit();
        }),
      );

      await expect
        .poll(async () => (await stats()).pending, {
          timeout: 500,
          interval: 10,
        })
        .toBe(1);
    });
  });

  describe('draining, as a function does', () => {
    beforeEach(() => boot('drain'));

    it('publishes before the command answers, because nothing would publish it after', async () => {
      await execute(new DoThing('t-7'));

      expect(broker.patterns()).toEqual(['things.ThingHappened.t-7']);
      expect(await stats()).toMatchObject({ pending: 0 });
    });

    it('answers the command anyway when the broker is down: the event is committed, and retried', async () => {
      broker.down = true;

      await expect(execute(new DoThing('t-8'))).resolves.toBeUndefined();

      expect(await thingsIn()).toEqual(['t-8']);
      expect(await stats()).toMatchObject({ pending: 1 });
    });
  });

  describe('polling, as a long-lived process does', () => {
    beforeEach(() => boot('poll'));

    it('wakes the relay when the command commits, rather than at the next poll', async () => {
      await execute(new DoThing('t-9'));

      await expect
        .poll(() => broker.patterns(), { timeout: 500, interval: 10 })
        .toEqual(['things.ThingHappened.t-9']);
    });
  });
});
