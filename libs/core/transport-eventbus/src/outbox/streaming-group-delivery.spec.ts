import { randomUUID } from 'node:crypto';
import { defineEntity, EntityManager, MikroORM, p } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import type { ICommandHandler, IEventHandler } from '@nestjs/cqrs';
import {
  AggregateRoot,
  AsyncContext,
  Command,
  CommandBus,
  CommandHandler,
  EventPublisher,
  EventsHandler,
} from '@nestjs/cqrs';
import type { OutboxHandlerContext, OutboxMessage } from '@nestjs/outbox';
import { OutboxModule, OutboxRelay } from '@nestjs/outbox';
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
  MikroOrmTransactionManager,
} from '@nestposts/outbox-mikro-orm';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { TRANSPORT_EVENT_BUS_PUBLISHER } from '../constants';
import { ProcessingGroup } from '../eventhandling/processing-group';
import { EventMessage } from '../messaging/event-message';
import { TRANSPORT_PROCESSING_GROUP } from '../outbound/message-headers';
import { OutboxRoute } from '../outbound/outbox-route';
import { isIngested } from '../outbound/transport-metadata';
import { TransportEventBusModule } from '../transport-event-bus.module';
import { StreamingGroupDelivery } from './streaming-group-delivery';

@EventType({ namespace: 'shipments', tags: ['shipmentId'] })
class ShipmentDispatchedEvent {
  constructor(
    readonly shipmentId: string,
    readonly occurredAt: Date,
  ) {}
}

class ShipmentRecord {
  constructor(readonly id: string) {}
}

const ShipmentRecordSchema = defineEntity({
  class: ShipmentRecord,
  tableName: 'shipments',
  properties: { id: p.string().primary() },
});

class Shipment extends AggregateRoot {
  dispatch(shipmentId: string): void {
    this.apply(new ShipmentDispatchedEvent(shipmentId, new Date()));
  }
}

class DispatchShipment extends Command<void> {
  constructor(readonly shipmentId: string) {
    super();
  }
}

class Request extends AsyncContext {
  toAttributes(): Record<string, string> {
    return { 'x-tenant': 'acme' };
  }
}

@CommandHandler(DispatchShipment)
class DispatchShipmentHandler implements ICommandHandler<DispatchShipment> {
  constructor(
    private readonly em: EntityManager,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ shipmentId }: DispatchShipment): Promise<void> {
    await this.em.persist(new ShipmentRecord(shipmentId)).flush();
    const shipment = this.publisher.mergeObjectContext(new Shipment());
    shipment.dispatch(shipmentId);
    shipment.commit();
  }
}

interface Telling {
  readonly group: string;
  readonly shipmentId: string;
  readonly visible: boolean;
  readonly identifier: string;
  readonly ingested: boolean;
  readonly tenant?: string;
}

@Injectable()
class Told {
  readonly tellings: Telling[] = [];
  failing = new Set<string>();

  of(group: string): Telling[] {
    return this.tellings.filter((telling) => telling.group === group);
  }
}

const tellOf =
  (group: string) =>
  async (
    told: Told,
    orm: MikroORM,
    event: ShipmentDispatchedEvent,
  ): Promise<void> => {
    const elsewhere = orm.em.fork({ disableContextResolution: true });
    const row = await elsewhere.findOne(ShipmentRecord, {
      id: event.shipmentId,
    });
    if (told.failing.has(group)) {
      throw new Error(`${group} is down`);
    }
    told.tellings.push({
      group,
      shipmentId: event.shipmentId,
      visible: row !== null,
      identifier: EventMessage.of(event).identifier,
      ingested: isIngested(event),
      tenant: EventMessage.of(event).metadata['x-tenant'],
    });
  };

@EventsHandler(ShipmentDispatchedEvent)
@ProcessingGroup('projection')
class Projection implements IEventHandler<ShipmentDispatchedEvent> {
  constructor(
    private readonly told: Told,
    private readonly orm: MikroORM,
  ) {}

  handle(event: ShipmentDispatchedEvent): Promise<void> {
    return tellOf('projection')(this.told, this.orm, event);
  }
}

@EventsHandler(ShipmentDispatchedEvent)
@ProcessingGroup('mailing')
class Mailing implements IEventHandler<ShipmentDispatchedEvent> {
  constructor(
    private readonly told: Told,
    private readonly orm: MikroORM,
  ) {}

  handle(event: ShipmentDispatchedEvent): Promise<void> {
    return tellOf('mailing')(this.told, this.orm, event);
  }
}

@EventsHandler(ShipmentDispatchedEvent)
@ProcessingGroup('invoicing', { processor: 'streaming' })
class Invoicing implements IEventHandler<ShipmentDispatchedEvent> {
  constructor(
    private readonly told: Told,
    private readonly orm: MikroORM,
  ) {}

  handle(event: ShipmentDispatchedEvent): Promise<void> {
    return tellOf('invoicing')(this.told, this.orm, event);
  }
}

describe('a streaming processing group, fed by the outbox', () => {
  let module: TestingModule;
  let told: Told;

  const execute = (shipmentId: string) =>
    module
      .get(CommandBus)
      .execute(new DispatchShipment(shipmentId), new Request());
  const relay = () => module.get(OutboxRelay);
  const pending = async () => (await relay().stats()).pending;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        CqsrsModule.forRoot({
          aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER,
        }),
        DatabaseModule.forRoot(
          testDatabaseConfig({
            entities: [ShipmentRecordSchema],
            allowGlobalContext: true,
          }),
        ),
        TestSchemaModule.forRoot(),
        OutboxModule.forRoot({
          route: OutboxRoute.over({}),
          relay: { enabled: false },
          retry: { attempts: 3, backoff: { delay: 1, jitter: 'none' } },
        }),
        MikroOrmOutboxModule.forRoot({ producer: 'shipments-api' }),
        TransportEventBusModule.forRoot({
          identity: 'shipments-api',
          transactionManager: MikroOrmTransactionManager,
          inbox: { descriptions: MikroOrmOutboxStore },
          outbox: {
            destinations: [],
            useFactory: () => ({ relay: 'off' }),
          },
          processingGroups: { mailing: 'streaming' },
        }),
      ],
      providers: [
        DispatchShipmentHandler,
        Projection,
        Mailing,
        Invoicing,
        Told,
      ],
    }).compile();
    await module.init();
    told = module.get(Told);
  });

  afterEach(() => module.close());

  it('is not told at the commit: the outbox holds one message for each streaming group', async () => {
    await execute('s-1');

    expect(told.of('projection')).toHaveLength(1);
    expect(told.of('mailing')).toEqual([]);
    expect(told.of('invoicing')).toEqual([]);
    expect(await pending()).toBe(2);
  });

  it('is told by the relay, after the commit, when the writes are visible to everybody', async () => {
    await execute('s-2');

    await relay().runOnce();

    expect(told.of('projection')).toMatchObject([{ visible: false }]);
    expect(told.of('mailing')).toMatchObject([{ visible: true }]);
    expect(told.of('invoicing')).toMatchObject([{ visible: true }]);
    expect(await pending()).toBe(0);
  });

  it('is told the event the unit raised: its identifier, its metadata, and no ingestion mark', async () => {
    await execute('s-3');
    await relay().runOnce();

    const [atCommit] = told.of('projection');
    expect(told.of('mailing')).toEqual([
      {
        group: 'mailing',
        shipmentId: 's-3',
        visible: true,
        identifier: atCommit.identifier,
        ingested: false,
        tenant: 'acme',
      },
    ]);
  });

  it('retries one group without holding back another: each has a message of its own', async () => {
    await execute('s-4');
    told.failing.add('mailing');

    await expect(relay().runOnce()).resolves.toMatchObject({
      published: 1,
      retried: 1,
    });
    expect(told.of('invoicing')).toHaveLength(1);

    told.failing.clear();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await relay().runOnce();
    expect(told.of('mailing')).toHaveLength(1);
  });

  it('tells a group once however many times the relay delivers its message, and records it under the service and the group', async () => {
    await execute('s-5');
    const [claimed] = await module.get(MikroOrmOutboxStore).claim({
      owner: randomUUID(),
      now: Date.now(),
      leaseMs: 30_000,
      limit: 1,
    });
    const delivery = module.get(StreamingGroupDelivery);
    const context = (message: OutboxMessage): OutboxHandlerContext => ({
      message,
      consumer: StreamingGroupDelivery.CONSUMER,
      attempt: 1,
      signal: new AbortController().signal,
      processInTransaction: () => {
        throw new Error(
          'the delivery records its inbox under its own consumer',
        );
      },
    });
    const group = claimed.headers[TRANSPORT_PROCESSING_GROUP];

    await delivery.receive(claimed.payload, context(claimed));
    await delivery.receive(claimed.payload, context(claimed));

    expect(
      told.tellings.filter((telling) => telling.group !== 'projection'),
    ).toHaveLength(1);
    expect(claimed.id).toMatch(new RegExp(`@shipments-api/${group}$`));
    await expect(
      module.get(MikroOrmOutboxStore).processedBy(`shipments-api/${group}`),
    ).resolves.toEqual([expect.objectContaining({ messageId: claimed.id })]);
  });
});
