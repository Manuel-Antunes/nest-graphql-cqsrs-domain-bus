import { Injectable } from '@nestjs/common';
import type { IEventHandler } from '@nestjs/cqrs';
import { EventsHandler } from '@nestjs/cqrs';
import type { OutboxHandlerContext, OutboxMessage } from '@nestjs/outbox';
import {
  OnOutboxMessage,
  Outbox,
  OutboxModule,
  OutboxRelay,
} from '@nestjs/outbox';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule } from '@nestposts/database';
import {
  TestSchemaModule,
  testDatabaseConfig,
} from '@nestposts/database/testing';
import {
  MikroOrmOutboxModule,
  MikroOrmOutboxStore,
  MikroOrmUnitOfWorkTransaction,
} from '@nestposts/outbox-mikro-orm';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { TRANSPORT_EVENT_BUS_PUBLISHER } from '../constants';
import { OutboxRoute } from '../outbound/outbox-route';
import { identifierOf, isIngested } from '../outbound/transport-metadata';
import { TransportEventBusModule } from '../transport-event-bus.module';
import { TransportEventBusService } from '../transport-event-bus.service';
import { UnitOfWorkTransaction } from '../unit-of-work/unit-of-work';

const PARCELS = 'parcels';

@EventType({ namespace: PARCELS, tags: ['parcelId'] })
class ParcelShippedEvent {
  constructor(
    readonly parcelId: string,
    readonly occurredAt: Date,
  ) {}
}

@Injectable()
class Told {
  readonly parcels: ParcelShippedEvent[] = [];
}

@EventsHandler(ParcelShippedEvent)
class TellParcels implements IEventHandler<ParcelShippedEvent> {
  constructor(private readonly told: Told) {}

  handle(event: ParcelShippedEvent): void {
    if (event.parcelId === 'refused') {
      throw new Error('the handler refused');
    }
    this.told.parcels.push(event);
  }
}

@Injectable()
class Watching {
  readonly messages: OutboxMessage[] = [];

  @OnOutboxMessage('parcels.ParcelShipped', {
    consumer: 'watching',
    inbox: false,
  })
  record(_payload: unknown, { message }: OutboxHandlerContext): void {
    this.messages.push(message);
  }
}

const noBroker = OutboxRoute.over({});

describe('what the outbox routes local, for want of a transport', () => {
  let module: TestingModule;

  const boot = async (routed: boolean) => {
    module = await Test.createTestingModule({
      imports: [
        CqsrsModule.forRoot({
          aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER,
        }),
        DatabaseModule.forRoot(
          testDatabaseConfig({ allowGlobalContext: true }),
        ),
        TestSchemaModule.forRoot(),
        OutboxModule.forRoot({ route: noBroker, relay: { enabled: false } }),
        MikroOrmOutboxModule.forRoot({ producer: 'parcels-api' }),
        TransportEventBusModule.forRoot({
          identity: 'parcels-api',
          transaction: MikroOrmUnitOfWorkTransaction,
          inbox: { descriptions: MikroOrmOutboxStore },
          outbox: {
            destinations: [PARCELS],
            useFactory: () => ({
              relay: 'off',
              ...(routed ? { route: noBroker } : {}),
            }),
          },
        }),
      ],
      providers: [TellParcels, Told, Watching],
    }).compile();
    await module.init();
  };

  const publish = (event: object) =>
    module.get(TransportEventBusService).publish(event);
  const relay = () => module.get(OutboxRelay);
  const watched = () => module.get(Watching).messages;
  const told = () => module.get(Told).parcels;
  const inbox = () =>
    module.get(MikroOrmOutboxStore).processedBy('parcels-api');

  afterEach(async () => {
    await module?.close();
  });

  describe('with a bus that was given the route', () => {
    beforeEach(() => boot(true));

    it('is delivered in this process under its qualified name, and published', async () => {
      await publish(new ParcelShippedEvent('p-1', new Date()));

      await expect(relay().runOnce()).resolves.toMatchObject({
        published: 1,
        retried: 0,
        deadLettered: 0,
      });
      expect(watched().map((message) => [message.topic, message.key])).toEqual([
        ['parcels.ParcelShipped', 'parcels/p-1'],
      ]);
      expect(await relay().stats()).toMatchObject({
        pending: 0,
        deadLetters: 0,
      });
    });

    it('is told to this process by the outbox, and not at the commit', async () => {
      await publish(new ParcelShippedEvent('p-2', new Date()));

      expect(told()).toEqual([]);

      await relay().runOnce();

      expect(told().map((event) => event.parcelId)).toEqual(['p-2']);
    });

    it('reaches the bus as this service’s own decision: its class, its identifier, no ingestion mark', async () => {
      await publish(
        new ParcelShippedEvent('p-3', new Date('2026-09-08T12:00:00.000Z')),
      );
      await relay().runOnce();

      const [event] = told();
      expect(event).toBeInstanceOf(ParcelShippedEvent);
      expect(event.occurredAt).toEqual(new Date('2026-09-08T12:00:00.000Z'));
      expect(isIngested(event)).toBe(false);
      expect(identifierOf(event)).toBe(watched()[0].id);
    });

    it('is remembered under this service’s name, so a redelivery is told to nobody', async () => {
      await publish(new ParcelShippedEvent('p-4', new Date()));
      await relay().runOnce();
      const [delivered] = watched();

      await module.get(UnitOfWorkTransaction).run(async (transaction) => {
        await module.get(Outbox).add(transaction, {
          id: delivered.id,
          topic: delivered.topic,
          key: delivered.key,
          headers: delivered.headers,
          payload: delivered.payload,
        });
      });
      await relay().runOnce();

      expect(watched()).toHaveLength(2);
      expect(told()).toHaveLength(1);
      await expect(inbox()).resolves.toEqual([
        expect.objectContaining({
          messageId: delivered.id,
          origin: 'parcels-api',
        }),
      ]);
    });

    it('fails the delivery when a handler fails, so the relay retries it and the inbox forgets it', async () => {
      await publish(new ParcelShippedEvent('refused', new Date()));

      await expect(relay().runOnce()).resolves.toMatchObject({
        published: 0,
        retried: 1,
      });
      await expect(inbox()).resolves.toEqual([]);
    });
  });

  describe('with a bus that was not given the route', () => {
    beforeEach(() => boot(false));

    it('is told at the commit, and only acknowledged when it is delivered local', async () => {
      await publish(new ParcelShippedEvent('p-5', new Date()));

      expect(told().map((event) => event.parcelId)).toEqual(['p-5']);

      await expect(relay().runOnce()).resolves.toMatchObject({
        published: 1,
      });
      expect(told()).toHaveLength(1);
    });
  });
});
