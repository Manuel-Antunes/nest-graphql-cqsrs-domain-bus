import { Injectable } from '@nestjs/common';
import type { ICommandHandler, IEvent, IEventHandler } from '@nestjs/cqrs';
import {
  Command,
  CommandBus,
  CommandHandler,
  EventsHandler,
  ofType,
  Saga,
} from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CqsrsModule } from '@nestposts/cqsrs';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';

import { TRANSPORT_EVENT_BUS_PUBLISHER } from '../constants';
import { LoggingErrorHandler } from '../eventhandling/error-handler';
import { ProcessingGroup } from '../eventhandling/processing-group';
import { CommandMessage } from '../messaging/command-message';
import { EventMessage } from '../messaging/event-message';
import { Message } from '../messaging/message';
import { TransportEventBusModule } from '../transport-event-bus.module';
import { TransportEventBusService } from '../transport-event-bus.service';
import { ProcessingContext } from './processing-context';

@EventType({ namespace: 'orders', tags: ['orderId'] })
class OrderPlaced {
  constructor(
    readonly orderId: string,
    readonly refuse = false,
  ) {}
}

class PlaceOrder extends Command<void> {
  constructor(
    readonly orderId: string,
    readonly refuse = false,
  ) {
    super();
  }
}

class ShipOrder extends Command<void> {
  constructor(
    readonly orderId: string,
    readonly refuse = false,
  ) {
    super();
  }
}

class AuditOrder extends Command<void> {
  constructor(readonly orderId: string) {
    super();
  }
}

const afterATick = () => new Promise((resolve) => setTimeout(resolve, 20));

@Injectable()
class Seen {
  readonly done: string[] = [];
  readonly contexts = new Map<string, ProcessingContext | undefined>();
  readonly messages = new Map<string, Message | undefined>();
}

@CommandHandler(PlaceOrder)
class PlaceOrderHandler implements ICommandHandler<PlaceOrder> {
  constructor(
    private readonly bus: TransportEventBusService,
    private readonly seen: Seen,
  ) {}

  async execute({ orderId, refuse }: PlaceOrder): Promise<void> {
    this.seen.contexts.set('PlaceOrder', ProcessingContext.current());
    this.seen.messages.set(
      'PlaceOrder',
      Message.fromContext(ProcessingContext.current()),
    );
    await this.bus.publish(new OrderPlaced(orderId, refuse));
  }
}

@CommandHandler(ShipOrder)
class ShipOrderHandler implements ICommandHandler<ShipOrder> {
  constructor(private readonly seen: Seen) {}

  async execute({ refuse }: ShipOrder): Promise<void> {
    this.seen.contexts.set('ShipOrder', ProcessingContext.current());
    this.seen.messages.set(
      'ShipOrder',
      Message.fromContext(ProcessingContext.current()),
    );
    await afterATick();
    if (refuse) {
      throw new Error('the command the saga dispatched refused');
    }
    this.seen.done.push('the command the saga dispatched');
  }
}

@CommandHandler(AuditOrder)
class AuditOrderHandler implements ICommandHandler<AuditOrder> {
  async execute(): Promise<void> {
    await afterATick();
    throw new Error('the audit is down');
  }
}

@EventsHandler(OrderPlaced)
@Injectable()
class SlowProjection implements IEventHandler<OrderPlaced> {
  constructor(private readonly seen: Seen) {}

  async handle(): Promise<void> {
    await afterATick();
    this.seen.done.push('the projection');
  }
}

@Injectable()
class Shipping {
  @Saga()
  ship = (events$: Observable<IEvent>) =>
    events$.pipe(
      ofType(OrderPlaced),
      map((event) => new ShipOrder(event.orderId, event.refuse)),
    );
}

@Injectable()
@ProcessingGroup('audit')
class Auditing {
  @Saga()
  audit = (events$: Observable<IEvent>) =>
    events$.pipe(
      ofType(OrderPlaced),
      map((event) => new AuditOrder(event.orderId)),
    );
}

describe('every command in a unit of work of its own', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let seen: Seen;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        CqsrsModule.forRoot({
          aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER,
        }),
        TransportEventBusModule.forRoot({
          identity: 'orders-spec',
          processingGroups: {
            audit: { errorHandler: new LoggingErrorHandler() },
          },
        }),
      ],
      providers: [
        Seen,
        PlaceOrderHandler,
        ShipOrderHandler,
        AuditOrderHandler,
        SlowProjection,
        Shipping,
        Auditing,
      ],
    }).compile();
    await module.init();
    commands = module.get(CommandBus);
    seen = module.get(Seen);
  });

  afterAll(() => module.close());

  beforeEach(() => {
    seen.done.length = 0;
    seen.contexts.clear();
    seen.messages.clear();
  });

  it('gives the command a saga dispatches a unit of its own, not the one that published the event', async () => {
    await commands.execute(new PlaceOrder('o-1'));

    const placing = seen.contexts.get('PlaceOrder');
    const shipping = seen.contexts.get('ShipOrder');
    expect(placing).toBeDefined();
    expect(shipping).toBeDefined();
    expect(shipping).not.toBe(placing);
    expect(seen.messages.get('ShipOrder')).toBeInstanceOf(CommandMessage);
  });

  it('answers only once the projection and the command the saga dispatched are done — which is what a frozen Lambda needs', async () => {
    await commands.execute(new PlaceOrder('o-2'));

    expect(seen.done).toEqual(
      expect.arrayContaining([
        'the projection',
        'the command the saga dispatched',
      ]),
    );
  });

  it('fails the command whose event set off a saga whose command failed: the subscribing group propagates', async () => {
    await expect(commands.execute(new PlaceOrder('o-3', true))).rejects.toThrow(
      'the command the saga dispatched refused',
    );
  });

  it('lets a group with a logging error handler fail without failing the unit', async () => {
    await expect(
      commands.execute(new PlaceOrder('o-4')),
    ).resolves.toBeUndefined();
  });

  it('carries the correlation of the first command through the event to the command the saga sent, which it caused', async () => {
    await commands.execute(new PlaceOrder('o-5'));

    const placing = seen.messages.get('PlaceOrder') as CommandMessage;
    const shipping = seen.messages.get('ShipOrder') as CommandMessage;
    expect(shipping.metadata.correlationId).toBe(placing.identifier);
    expect(shipping.metadata.causationId).not.toBe(placing.identifier);
    expect(shipping.metadata.causationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('stamps an event with the command it was published in', async () => {
    const published: EventMessage[] = [];
    const bus = module.get(TransportEventBusService);
    const handler = module.get(PlaceOrderHandler);
    const original = handler.execute.bind(handler);
    handler.execute = async (command) => {
      const event = new OrderPlaced(command.orderId);
      await bus.publish(event);
      published.push(EventMessage.of(event));
      return original(command);
    };

    await commands.execute(new PlaceOrder('o-6'));
    handler.execute = original;

    const placing = seen.messages.get('PlaceOrder') as CommandMessage;
    expect(published[0].metadata).toMatchObject({
      correlationId: placing.identifier,
      causationId: placing.identifier,
    });
  });
});
