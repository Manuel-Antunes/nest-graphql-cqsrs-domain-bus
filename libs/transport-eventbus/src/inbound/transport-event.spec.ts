import { Controller, Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
  AsyncContext,
  Command,
  CommandBus,
  CommandHandler,
  CqrsModule,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { EventPattern } from '@nestjs/microservices';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import { TransportEvent } from '../decorators/transport-event.decorator';
import { TransportRequest } from '../decorators/transport-request.decorator';
import { MemoryClient } from '../in-memory/memory-client';
import { EventEnvelopeFactory } from '../outbound/event-envelope.factory';
import { EventAddress, everyEventOf } from '../outbound/event-address';
import { MemoryEventEnvelopeSerializer } from '../outbound/serializers/memory-event-envelope.serializer';
import {
  CorrelatedRequestContext,
  RequestContextCodec,
  TransportRequestContext,
} from '../request-context';
import { startInProcessService } from '../testing/in-process-service';
import { TransportIdentity } from '../transport-identity';
import { IncomingRequest } from './incoming-request';
import { TransportRequestPipe } from './transport-request.pipe';

const SHOP = 'shop';

@EventType({ namespace: SHOP, tags: ['orderId'] })
class OrderPlacedEvent {
  constructor(
    readonly orderId: string,
    readonly total: number,
    readonly occurredAt: Date,
  ) {}
}

@EventType({ namespace: SHOP, tags: ['orderId'] })
class OrderShippedEvent {
  constructor(
    readonly orderId: string,
    readonly occurredAt: Date,
  ) {}
}

@EventType({ namespace: 'billing', tags: ['invoiceId'] })
class InvoiceIssuedEvent {
  constructor(
    readonly invoiceId: string,
    readonly occurredAt: Date,
  ) {}
}

class Arrival {
  constructor(
    readonly event: object,
    readonly request: AsyncContext | undefined,
  ) {}
}

@Injectable()
class Arrivals {
  readonly arrivals: Arrival[] = [];
  readonly correlations: (string | undefined)[] = [];
}

class NoteTheOrder extends Command<void> {
  constructor(readonly orderId: string) {
    super();
  }
}

@CommandHandler(NoteTheOrder, { scope: Scope.REQUEST })
class NoteTheOrderHandler implements ICommandHandler<NoteTheOrder> {
  constructor(
    private readonly arrivals: Arrivals,
    @Inject(REQUEST) private readonly request: AsyncContext,
  ) {}

  async execute(): Promise<void> {
    this.arrivals.correlations.push((this.request as TransportRequestContext)?.correlationId);
  }
}

@Controller()
class ShopEventsController {
  constructor(
    private readonly arrivals: Arrivals,
    private readonly commandBus: CommandBus,
  ) {}

  @EventPattern<string>(everyEventOf(SHOP))
  shop(@TransportEvent() event: object, @TransportRequest() request?: AsyncContext): Promise<void> {
    this.arrivals.arrivals.push(new Arrival(event, request));
    return this.commandBus.execute(new NoteTheOrder('o-1'), request);
  }
}

@Injectable()
class ShopIdentity extends TransportIdentity {
  readonly applicationName = 'shop';
}

describe('one entry per namespace, through @TransportEvent() and @TransportRequest()', () => {
  let consuming: Awaited<ReturnType<typeof startInProcessService>>;
  let publishing: MemoryClient;
  let envelopes: EventEnvelopeFactory;
  let arrivals: Arrivals;

  const publish = (event: object, request?: AsyncContext) => {
    if (request) {
      request.attachTo(event);
    }
    const address = EventAddress.of(event);
    return lastValue(
      publishing.emit(`${address.qualifiedName}.${address.orderingKey}`, envelopes.of(event, address)),
    );
  };

  const lastValue = (stream: { subscribe: (observer: { complete: () => void; error: (failure: unknown) => void }) => void }) =>
    new Promise<void>((resolve, reject) =>
      stream.subscribe({ complete: () => resolve(), error: (failure) => reject(failure) }),
    );

  beforeAll(async () => {
    consuming = await startInProcessService({
      imports: [CqrsModule.forRoot()],
      controllers: [ShopEventsController],
      providers: [
        IncomingRequest,
        TransportRequestPipe,
        { provide: RequestContextCodec, useClass: CorrelatedRequestContext },
        Arrivals,
        NoteTheOrderHandler,
      ],
    });
    envelopes = new EventEnvelopeFactory(new ShopIdentity(), new CorrelatedRequestContext());
    publishing = new MemoryClient({
      servers: [consuming.server],
      serializer: new MemoryEventEnvelopeSerializer(),
    });
    arrivals = consuming.app.get(Arrivals);
  });

  afterAll(() => consuming.app.close());

  beforeEach(() => {
    arrivals.arrivals.length = 0;
    arrivals.correlations.length = 0;
  });

  it('binds the namespace, and nothing else', () => {
    expect(publishing.bindings()).toEqual(['shop.#']);
  });

  it('answers with the concrete class, whichever event of the namespace arrived', async () => {
    await publish(new OrderPlacedEvent('o-1', 42, new Date('2026-09-08T12:00:00.000Z')));
    await publish(new OrderShippedEvent('o-1', new Date('2026-09-08T13:00:00.000Z')));

    expect(arrivals.arrivals.map((arrival) => arrival.event.constructor)).toEqual([
      OrderPlacedEvent,
      OrderShippedEvent,
    ]);
    expect((arrivals.arrivals[0].event as OrderPlacedEvent).total).toBe(42);
    expect((arrivals.arrivals[0].event as OrderPlacedEvent).occurredAt).toBeInstanceOf(Date);
  });

  it('does not carry an event of another namespace into this entry', async () => {
    await publish(new InvoiceIssuedEvent('i-1', new Date()));

    expect(arrivals.arrivals).toHaveLength(0);
  });

  it('hands over the request the message belongs to, rebuilt by the application codec', async () => {
    const request = new TransportRequestContext('c-1', undefined, {});

    await publish(new OrderPlacedEvent('o-2', 1, new Date()), request);

    const [arrival] = arrivals.arrivals;
    expect(arrival.request).toBeInstanceOf(TransportRequestContext);
    expect((arrival.request as TransportRequestContext).correlationId).toBe('c-1');
  });

  it('runs the command it dispatches in that same request', async () => {
    const request = new TransportRequestContext('c-2', undefined, {});

    await publish(new OrderPlacedEvent('o-3', 1, new Date()), request);

    expect(arrivals.correlations).toEqual(['c-2']);
  });

  it('hands over no request for a message published outside one, and the handler still runs', async () => {
    await publish(new OrderShippedEvent('o-4', new Date()));

    expect(arrivals.arrivals[0].request).toBeUndefined();
    expect(arrivals.correlations).toEqual([undefined]);
  });
});
