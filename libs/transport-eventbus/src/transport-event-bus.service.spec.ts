import { Injectable } from '@nestjs/common';
import {
  AggregateRoot,
  CommandBus,
  CommandHandler,
  CqrsModule,
  EventPublisher,
  EventsHandler,
  type ICommandHandler,
  type IEvent,
  type IEventHandler,
  ofType,
  Saga,
} from '@nestjs/cqrs';
import { ClientProxy } from '@nestjs/microservices';
import { Test, type TestingModule } from '@nestjs/testing';
import { map, type Observable } from 'rxjs';
import { Inject } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import { TRANSPORT_MESSAGE_TYPE, TRANSPORT_ORIGIN } from './outbound/event-envelope';
import { TRANSPORT_EVENT_BUS_PUBLISHER, TRANSPORT_EVENT_BUS_SERVICE } from './constants';
import { ExcludeDef } from './decorators/exclude-def.decorator';
import { EVERY_NAMESPACE, Publisher } from './decorators/publisher.decorator';
import { CorrelatedRequestContext, RequestContextCodec } from './request-context';
import { RecordingClient } from './testing/recording-client';
import { transportEventBusProviders } from './transport-event-bus.providers';
import { TransportIdentity } from './transport-identity';
import type { TransportEventBusService } from './transport-event-bus.service';

/**
 * The integration suite of nestjs-transport-eventbus, ported assertion for assertion.
 *
 * It is what proves the vendored base still behaves as it did — what leaves and what does not, what
 * `@ExcludeDef` costs, `publishAll`, a saga, a service that injects the bus, and an aggregate committed
 * through the transport publisher — on `@nestjs/cqrs` 12, where the event identity that made half of it
 * work no longer exists. See `NOTICE.md`.
 *
 * Two things are translated rather than copied, and the fixture names are upstream's on purpose so the
 * correspondence stays readable: what an event may leave through is **its namespace** and not a
 * `@TransportType` it carries (the `Rabbit*` fixtures are the ones in the namespace this service's
 * destination takes; `Default*` are in one nothing takes), and upstream's own mode — no namespaces at
 * all, everything under one pattern — is the last describe.
 *
 * Upstream's fixtures wrote into a `Storage` provider; here a handler records into the same map, which
 * keeps the assertions readable side by side with theirs.
 */
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

@EventType({ namespace: NOBODY_PUBLISHES })
@ExcludeDef()
class ExcludeDefEvent {
  constructor(readonly message: string) {}
}

@EventType({ namespace: SHOP })
class RabbitWithDefEvent {
  constructor(readonly message: string) {}
}

@EventType({ namespace: SHOP })
@ExcludeDef()
class RabbitEvent {
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

@EventsHandler(ExcludeDefEvent)
class ExcludeDefEventHandler implements IEventHandler<ExcludeDefEvent> {
  constructor(private readonly storage: Storage) {}

  handle(event: ExcludeDefEvent): void {
    this.storage.upsert('ExcludeDefEvent', event.message);
  }
}

@EventsHandler(RabbitWithDefEvent)
class RabbitWithDefEventHandler implements IEventHandler<RabbitWithDefEvent> {
  constructor(private readonly storage: Storage) {}

  handle(event: RabbitWithDefEvent): void {
    this.storage.upsert('RabbitWithDefEvent', event.message);
  }
}

@EventsHandler(RabbitEvent)
class RabbitEventHandler implements IEventHandler<RabbitEvent> {
  constructor(private readonly storage: Storage) {}

  handle(event: RabbitEvent): void {
    this.storage.upsert('RabbitEvent', event.message);
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
class TryAggregateRootEventHandler implements IEventHandler<TryAggregateRootEvent> {
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
class TryAggregateRootCommandHandler implements ICommandHandler<TryAggregateRootCommand> {
  constructor(
    @Inject(TRANSPORT_EVENT_BUS_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(command: TryAggregateRootCommand): Promise<void> {
    const model = this.publisher.mergeObjectContext(new TestModel());
    model.applyEvent(command.message);
    model.commit();
  }
}

@Injectable()
class TestEventService {
  constructor(
    @Inject(TRANSPORT_EVENT_BUS_SERVICE) private readonly eventBus: TransportEventBusService,
  ) {}

  publishEvent(event: object): Promise<void> {
    return this.eventBus.publish(event);
  }
}

@Injectable()
@Publisher(SHOP)
class RabbitPublisher {
  readonly client: ClientProxy;

  constructor() {
    this.client = new RecordingClient();
  }
}


const metadataOf = (message: { data: unknown }) =>
  (message.data as { metadata: Record<string, string> }).metadata;

describe('the transport event bus (the vendored base)', () => {
  let module: TestingModule;
  let eventBus: TransportEventBusService;
  let storage: Storage;
  let commandBus: CommandBus;
  let rabbit: RecordingClient;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [CqrsModule.forRoot(), DiscoveryModule],
      providers: [
        ...transportEventBusProviders,
        { provide: TransportIdentity, useValue: TransportIdentity.named('the-suite') },
        { provide: RequestContextCodec, useClass: CorrelatedRequestContext },
        RabbitPublisher,
        Storage,
        TestEventService,
        DefaultEventHandler,
        ExcludeDefEventHandler,
        RabbitWithDefEventHandler,
        RabbitEventHandler,
        InternalEventHandler,
        TryAggregateRootEventHandler,
        TrySagaCommandHandler,
        TrySagaHandler,
        TryAggregateRootCommandHandler,
      ],
    }).compile();
    await module.init();

    eventBus = module.get(TRANSPORT_EVENT_BUS_SERVICE);
    storage = module.get(Storage);
    commandBus = module.get(CommandBus);
    rabbit = module.get(RabbitPublisher).client as RecordingClient;
  });

  afterAll(() => module.close());

  beforeEach(() => {
    storage.clear();
    rabbit.clear();
  });

  const sentMessages = () => rabbit.sent.map((message) => message.data);
  const afterFloatingPublishesSettle = () => new Promise((resolve) => setImmediate(resolve));

  describe('what goes out, and what runs locally', () => {
    it('calls the DefaultEvent handler and sends nothing: no destination takes its namespace', async () => {
      await eventBus.publish(new DefaultEvent('DefaultEvent'));

      expect(storage.get('DefaultEvent')).toBe('DefaultEvent');
      expect(sentMessages()).toHaveLength(0);
    });

    it('does not call the ExcludeDefEvent handler', async () => {
      await eventBus.publish(new ExcludeDefEvent('ExcludeDefEvent'));

      expect(storage.get('ExcludeDefEvent')).toBe(false);
      expect(sentMessages()).toHaveLength(0);
    });

    it('sends RabbitWithDefEvent AND calls its handler', async () => {
      await eventBus.publish(new RabbitWithDefEvent('RabbitWithDefEvent'));

      expect(storage.get('RabbitWithDefEvent')).toBe('RabbitWithDefEvent');
      expect(rabbit.sent).toHaveLength(1);
    });

    it('sends RabbitEvent and does NOT call its handler: @ExcludeDef is the local opt-out', async () => {
      await eventBus.publish(new RabbitEvent('RabbitEvent'));

      expect(storage.get('RabbitEvent')).toBe(false);
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

      expect(metadataOf(rabbit.sent[0])).toMatchObject({
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
      await module.get(TestEventService).publishEvent(new RabbitWithDefEvent('from a service'));

      expect(storage.get('RabbitWithDefEvent')).toBe('from a service');
      expect(rabbit.sent).toHaveLength(1);
    });

    it('carries the events an aggregate commits, once commit()\'s unawaited publish settles', async () => {
      await commandBus.execute(new TryAggregateRootCommand('TryAggregateRootEvent'));

      expect(storage.get('TryAggregateRootEvent')).toBe('TryAggregateRootEvent');

      await afterFloatingPublishesSettle();

      expect(rabbit.sent).toHaveLength(1);
    });
  });
});

describe("upstream's own mode: one destination, every namespace", () => {
  let module: TestingModule;
  let eventBus: TransportEventBusService;
  let everything: RecordingClient;
  let storage: Storage;

  @Injectable()
  @Publisher(EVERY_NAMESPACE)
  class EverythingPublisher {
    readonly client: ClientProxy;

    constructor() {
      this.client = new RecordingClient();
    }
  }

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [CqrsModule.forRoot(), DiscoveryModule],
      providers: [
        ...transportEventBusProviders,
        { provide: TransportIdentity, useValue: TransportIdentity.named('the-suite') },
        { provide: RequestContextCodec, useClass: CorrelatedRequestContext },
        EverythingPublisher,
        Storage,
        InternalEventHandler,
      ],
    }).compile();
    await module.init();

    eventBus = module.get(TRANSPORT_EVENT_BUS_SERVICE);
    everything = module.get(EverythingPublisher).client as RecordingClient;
    storage = module.get(Storage);
  });

  afterAll(() => module.close());

  it('carries an event that declares no namespace at all, which nothing else would', async () => {
    await eventBus.publish(new InternalEvent('InternalEvent'));

    expect(everything.sent).toHaveLength(1);
    expect(storage.get('InternalEvent')).toBe('InternalEvent');
  });

  it('sends it under the single pattern, with its class name as the message type', async () => {
    everything.clear();

    await eventBus.publish(new InternalEvent('InternalEvent'));

    expect(everything.patterns()).toEqual(['TRANSPORT_EVENT_BUS_PATTERN']);
    expect(metadataOf(everything.sent[0])).toMatchObject({
      [TRANSPORT_MESSAGE_TYPE]: 'InternalEvent',
    });
  });
});
