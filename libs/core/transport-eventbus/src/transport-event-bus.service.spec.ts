import { Inject, Injectable, Module } from '@nestjs/common';
import type { ICommandHandler, IEvent, IEventHandler } from '@nestjs/cqrs';
import {
  AggregateRoot,
  CommandBus,
  CommandHandler,
  EventPublisher,
  EventsHandler,
  ofType,
  Saga,
} from '@nestjs/cqrs';
import type { OutboxEnvelope } from '@nestjs/outbox';
import { ClientProxyTransport, OutboxModule } from '@nestjs/outbox';
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
  MikroOrmUnitOfWorkTransaction,
} from '@nestposts/outbox-mikro-orm';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';

import { TRANSPORT_EVENT_BUS_PUBLISHER } from './constants';
import {
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
} from './outbound/message-headers';
import { OutboxPackets } from './outbound/outbox-packets';
import { OutboxRoute } from './outbound/outbox-route';
import { RecordingClient } from './testing/recording-client';
import { TransportEventBusModule } from './transport-event-bus.module';
import { TransportEventBusService } from './transport-event-bus.service';

@Injectable()
class Storage {
  private readonly data = new Map<string, unknown>();

  upsert(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  get(key: string): unknown {
    return this.data.get(key) ?? false;
  }

  clear(): void {
    this.data.clear();
  }
}

const SHOP = 'shop';
const NOBODY_PUBLISHES = 'nobody-publishes';

@EventType({ namespace: NOBODY_PUBLISHES })
class DefaultEvent {
  constructor(readonly message: string) {}
}

@EventType({ namespace: SHOP })
class RabbitWithDefEvent {
  constructor(readonly message: string) {}
}

@EventType({ namespace: SHOP })
class SagaEvent {
  constructor(readonly message: string) {}
}

@EventType({ namespace: SHOP })
class TryAggregateRootEvent {
  constructor(readonly message: string) {}
}

class InternalEvent {
  constructor(readonly message: string) {}
}

@EventsHandler(DefaultEvent)
class DefaultEventHandler implements IEventHandler<DefaultEvent> {
  constructor(private readonly storage: Storage) {}

  handle(event: DefaultEvent): void {
    this.storage.upsert('DefaultEvent', event.message);
  }
}

@EventsHandler(RabbitWithDefEvent)
class RabbitWithDefEventHandler implements IEventHandler<RabbitWithDefEvent> {
  constructor(private readonly storage: Storage) {}

  handle(event: RabbitWithDefEvent): void {
    this.storage.upsert('RabbitWithDefEvent', event.message);
  }
}

@EventsHandler(InternalEvent)
class InternalEventHandler implements IEventHandler<InternalEvent> {
  constructor(private readonly storage: Storage) {}

  handle(event: InternalEvent): void {
    this.storage.upsert('InternalEvent', event.message);
  }
}

@EventsHandler(TryAggregateRootEvent)
class TryAggregateRootEventHandler
  implements IEventHandler<TryAggregateRootEvent>
{
  constructor(private readonly storage: Storage) {}

  handle(event: TryAggregateRootEvent): void {
    this.storage.upsert('TryAggregateRootEvent', event.message);
  }
}

class TrySagaCommand {
  constructor(readonly message: string) {}
}

@CommandHandler(TrySagaCommand)
class TrySagaCommandHandler implements ICommandHandler<TrySagaCommand> {
  constructor(private readonly storage: Storage) {}

  async execute(command: TrySagaCommand): Promise<void> {
    this.storage.upsert('TrySagaCommand', command.message);
  }
}

@Injectable()
class TrySagaHandler {
  @Saga()
  onSagaEvent = (events$: Observable<IEvent>): Observable<TrySagaCommand> =>
    events$.pipe(
      ofType(SagaEvent),
      map((event: SagaEvent) => new TrySagaCommand(event.message)),
    );
}

class TestModel extends AggregateRoot {
  applyEvent(message: string): void {
    this.apply(new TryAggregateRootEvent(message));
  }
}

class TryAggregateRootCommand {
  constructor(readonly message: string) {}
}

@CommandHandler(TryAggregateRootCommand)
class TryAggregateRootCommandHandler
  implements ICommandHandler<TryAggregateRootCommand>
{
  constructor(
    @Inject(TRANSPORT_EVENT_BUS_PUBLISHER)
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: TryAggregateRootCommand): Promise<void> {
    const model = this.publisher.mergeObjectContext(new TestModel());
    model.applyEvent(command.message);
    model.commit();
  }
}

@Injectable()
class TestEventService {
  constructor(private readonly eventBus: TransportEventBusService) {}

  publishEvent(event: object): Promise<void> {
    return this.eventBus.publish(event);
  }
}

class Rabbit extends RecordingClient {}

@Module({
  providers: [{ provide: Rabbit, useValue: new Rabbit() }],
  exports: [Rabbit],
})
class RabbitModule {}

const transports = {
  [SHOP]: ClientProxyTransport(Rabbit, {
    toPacket: OutboxPackets.inProcess,
  }),
};

const headersOf = (message: { data: unknown }) =>
  (message.data as OutboxEnvelope).headers;

describe('the transport event bus (the vendored base)', () => {
  let module: TestingModule;
  let eventBus: TransportEventBusService;
  let storage: Storage;
  let commandBus: CommandBus;
  let rabbit: RecordingClient;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        CqsrsModule.forRoot(),
        DatabaseModule.forRoot(
          testDatabaseConfig({ allowGlobalContext: true }),
        ),
        TestSchemaModule.forRoot(),
        OutboxModule.forRoot({
          imports: [RabbitModule],
          transports,
          route: OutboxRoute.over(transports),
          relay: { enabled: false },
        }),
        MikroOrmOutboxModule.forRoot({ producer: 'the-suite' }),
        TransportEventBusModule.forRoot({
          identity: 'the-suite',
          transaction: MikroOrmUnitOfWorkTransaction,
          outbox: {
            destinations: [SHOP],
            useFactory: () => ({ relay: 'drain' }),
          },
        }),
      ],
      providers: [
        Storage,
        TestEventService,
        DefaultEventHandler,
        RabbitWithDefEventHandler,
        InternalEventHandler,
        TryAggregateRootEventHandler,
        TrySagaCommandHandler,
        TrySagaHandler,
        TryAggregateRootCommandHandler,
      ],
    }).compile();
    await module.init();

    eventBus = module.get(TransportEventBusService);
    storage = module.get(Storage);
    commandBus = module.get(CommandBus);
    rabbit = module.get(Rabbit);
  });

  afterAll(() => module.close());

  beforeEach(() => {
    storage.clear();
    rabbit.clear();
  });

  const sentMessages = () => rabbit.sent.map((message) => message.data);

  describe('what goes out, and what runs locally', () => {
    it('calls the DefaultEvent handler and sends nothing: no destination takes its namespace', async () => {
      await eventBus.publish(new DefaultEvent('DefaultEvent'));

      expect(storage.get('DefaultEvent')).toBe('DefaultEvent');
      expect(sentMessages()).toHaveLength(0);
    });

    it('sends RabbitWithDefEvent AND calls its handler', async () => {
      await eventBus.publish(new RabbitWithDefEvent('RabbitWithDefEvent'));

      expect(storage.get('RabbitWithDefEvent')).toBe('RabbitWithDefEvent');
      expect(rabbit.sent).toHaveLength(1);
    });

    it('keeps an event with no @EventType at home: it has no namespace to be taken by', async () => {
      await eventBus.publish(new InternalEvent('InternalEvent'));

      expect(storage.get('InternalEvent')).toBe('InternalEvent');
      expect(sentMessages()).toHaveLength(0);
    });

    it('publishes a whole array, each event by its own rules', async () => {
      await eventBus.publishAll([
        new DefaultEvent('DefaultEvent'),
        new RabbitWithDefEvent('RabbitWithDefEvent'),
      ]);

      expect(storage.get('DefaultEvent')).toBe('DefaultEvent');
      expect(storage.get('RabbitWithDefEvent')).toBe('RabbitWithDefEvent');
      expect(rabbit.sent).toHaveLength(1);
    });
  });

  describe('the pattern an event goes out under', () => {
    it('is the three-segment routing key the event addresses itself with', async () => {
      await eventBus.publish(new RabbitWithDefEvent('RabbitWithDefEvent'));

      expect(rabbit.patterns()).toEqual(['shop.RabbitWithDef.none']);
    });

    it('carries the event under the message type its @EventType declares', async () => {
      await eventBus.publish(new RabbitWithDefEvent('carried'));

      expect(headersOf(rabbit.sent[0])).toMatchObject({
        [TRANSPORT_MESSAGE_TYPE]: 'shop.RabbitWithDef#1.0.0',
        [TRANSPORT_ORIGIN]: 'the-suite',
      });
    });
  });

  describe('the rest of CQRS keeps working through it', () => {
    it('feeds a saga, which dispatches its command', async () => {
      await eventBus.publish(new SagaEvent('SagaEvent'));

      expect(storage.get('TrySagaCommand')).toBe('SagaEvent');
    });

    it('is injectable as an IEventBus, and a service publishing through it reaches the handler', async () => {
      await module
        .get(TestEventService)
        .publishEvent(new RabbitWithDefEvent('from a service'));

      expect(storage.get('RabbitWithDefEvent')).toBe('from a service');
      expect(rabbit.sent).toHaveLength(1);
    });

    it('carries the events an aggregate commits by the time the command answers', async () => {
      await commandBus.execute(
        new TryAggregateRootCommand('TryAggregateRootEvent'),
      );

      expect(storage.get('TryAggregateRootEvent')).toBe(
        'TryAggregateRootEvent',
      );
      expect(rabbit.sent).toHaveLength(1);
    });
  });
});
