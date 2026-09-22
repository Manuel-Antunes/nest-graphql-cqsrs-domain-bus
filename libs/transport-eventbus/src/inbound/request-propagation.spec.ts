import { dropTestSchema, ensureTestSchema, testDatabaseConfig } from '@nestposts/database/testing';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Inject,
  Injectable,
  Scope,
  UseGuards,
} from '@nestjs/common';
import { DiscoveryModule, REQUEST } from '@nestjs/core';
import {
  AsyncContext,
  Command,
  CommandBus,
  CommandHandler,
  CqrsModule,
  EventsHandler,
  type ICommand,
  type ICommandHandler,
  type IEvent,
  type IEventHandler,
  Saga,
  ofType,
} from '@nestjs/cqrs';
import { EventPattern } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import { type Observable, map } from 'rxjs';
import { TransportEvent } from '../decorators/transport-event.decorator';
import { MemoryClient } from '../in-memory/memory-client';
import { EventAddress } from '../outbound/event-address';
import { EventEnvelopeFactory } from '../outbound/event-envelope.factory';
import { MemoryEventEnvelopeSerializer } from '../outbound/serializers/memory-event-envelope.serializer';
import { MessageInbox, MikroOrmMessageInbox } from '../persistence/message-inbox';
import { transportEntities } from '../persistence/message-inbox.entity';
import {
  type ContextAttributes,
  CorrelatedRequestContext,
  RequestContextCodec,
  correlationIdOf,
} from '../request-context';
import type { Ingestion } from '../outbound/transport-metadata';
import { startInProcessService } from '../testing';
import { TRANSPORT_EVENT_BUS_SERVICE } from '../constants';
import { transportEventBusProviders, eventIngestionProviders } from '../transport-event-bus.providers';
import { TransportIdentity } from '../transport-identity';
import type { TransportEventBusService } from '../transport-event-bus.service';
import { EventIngestion } from './event-ingestion';
import { IncomingRequest } from './incoming-request';

const SHOP = 'shop';
const TENANT = 'x-tenant-id';
const USER = 'x-user-id';

@EventType({ namespace: SHOP, tags: ['orderId'] })
class OrderPlacedEvent {
  constructor(
    readonly orderId: string,
    readonly occurredAt: Date,
  ) {}
}

/** What this application calls a request: a tenant, whoever asked, and the trace it belongs to. */
class ShopRequest extends AsyncContext implements ContextAttributes {
  constructor(
    readonly tenantId: string,
    readonly userId: string,
  ) {
    super();
  }

  static override of(target: object): ShopRequest | undefined {
    const context = AsyncContext.of(target);
    return context instanceof ShopRequest ? context : undefined;
  }

  toAttributes(): Record<string, string> {
    return { [TENANT]: this.tenantId, [USER]: this.userId };
  }
}

@Injectable()
class ShopRequestCodec extends CorrelatedRequestContext {
  protected override contextFor(message: Ingestion): AsyncContext | undefined {
    const tenantId = message.metadata[TENANT];
    const userId = message.metadata[USER];
    return tenantId && userId ? new ShopRequest(tenantId, userId) : undefined;
  }
}

@Injectable()
class Seen {
  readonly guarded: { tenantId?: string; userId?: string }[] = [];
  readonly handled: ShopRequest[] = [];
  readonly commanded: { tenantId?: string; userId?: string; correlationId?: string }[] = [];
}

@Injectable()
class TenantGuard implements CanActivate {
  constructor(
    private readonly incoming: IncomingRequest,
    private readonly seen: Seen,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = this.incoming.of(context);
    const shop = request instanceof ShopRequest ? request : undefined;
    this.seen.guarded.push({ tenantId: shop?.tenantId, userId: shop?.userId });
    return shop?.tenantId === 'acme';
  }
}

class NoteTheOrder extends Command<void> {
  constructor(readonly orderId: string) {
    super();
  }
}

@CommandHandler(NoteTheOrder, { scope: Scope.REQUEST })
class NoteTheOrderHandler implements ICommandHandler<NoteTheOrder> {
  constructor(
    private readonly seen: Seen,
    @Inject(REQUEST) private readonly request: AsyncContext,
  ) {}

  async execute(): Promise<void> {
    const shop = this.request instanceof ShopRequest ? this.request : undefined;
    this.seen.commanded.push({
      tenantId: shop?.tenantId,
      userId: shop?.userId,
      correlationId: shop ? correlationIdOf(shop) : undefined,
    });
  }
}

@Injectable()
class NoteOnOrderPlaced {
  constructor(private readonly seen: Seen) {}

  @Saga()
  onOrderPlaced = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(OrderPlacedEvent),
      map((event) => {
        const request = ShopRequest.of(event);
        if (request) {
          this.seen.handled.push(request);
        }
        const command = new NoteTheOrder(event.orderId);
        AsyncContext.merge(event, command);
        return command;
      }),
    );
}

@EventsHandler(OrderPlacedEvent)
class OrderPlacedHandler implements IEventHandler<OrderPlacedEvent> {
  handle(): void {
    // Declared so @nestjs/cqrs stamps its event id on the class.
  }
}

@Controller()
@UseGuards(TenantGuard)
class ShopEventsController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern(EventAddress.everyEventOf(SHOP))
  shop(@TransportEvent() event: OrderPlacedEvent): Promise<void> {
    return this.ingestion.ingest(event);
  }
}


describe('the request that crosses: what a guard, a saga and a command all see', () => {
  let consuming: Awaited<ReturnType<typeof startInProcessService>>;
  let publishing: MemoryClient;
  let envelopes: EventEnvelopeFactory;
  let seen: Seen;
  let bus: TransportEventBusService;

  const settle = async () => {
    for (let turn = 0; turn < 20; turn++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  const publish = async (event: object, request?: AsyncContext) => {
    if (request) {
      request.attachTo(event);
    }
    const address = EventAddress.of(event);
    await new Promise<void>((resolve, reject) =>
      publishing
        .emit(`${address.qualifiedName}.${address.orderingKey}`, envelopes.of(event, address))
        .subscribe({ complete: () => resolve(), error: reject }),
    );
    await settle();
  };

  beforeAll(async () => {
    consuming = await startInProcessService({
      imports: [
        CqrsModule.forRoot(),
        DiscoveryModule,
        MikroOrmModule.forRoot(
          testDatabaseConfig({
            entities: [...transportEntities],
            allowGlobalContext: true,
          }),
        ),
      ],
      controllers: [ShopEventsController],
      providers: [
        ...transportEventBusProviders,
        ...eventIngestionProviders,
        { provide: TransportIdentity, useValue: TransportIdentity.named('shop') },
        { provide: RequestContextCodec, useClass: ShopRequestCodec },
        { provide: MessageInbox, useClass: MikroOrmMessageInbox },
        Seen,
        TenantGuard,
        NoteTheOrderHandler,
        NoteOnOrderPlaced,
        OrderPlacedHandler,
      ],
    });
    envelopes = new EventEnvelopeFactory(
      TransportIdentity.named('orders'),
      new ShopRequestCodec(),
    );
    publishing = new MemoryClient({
      servers: [consuming.server],
      serializer: new MemoryEventEnvelopeSerializer(),
    });
    seen = consuming.app.get(Seen);
    bus = consuming.app.get(TRANSPORT_EVENT_BUS_SERVICE);
  });

  afterAll(() => consuming.close());

  beforeEach(() => {
    seen.guarded.length = 0;
    seen.handled.length = 0;
    seen.commanded.length = 0;
  });

  describe('a message from another service', () => {
    it('reaches a GUARD with the tenant and the user the publisher put in the request', async () => {
      await publish(new OrderPlacedEvent('o-1', new Date()), new ShopRequest('acme', 'u-1'));

      expect(seen.guarded).toEqual([{ tenantId: 'acme', userId: 'u-1' }]);
    });

    it('reaches the SAGA as the application\'s own context, not as a bag of metadata', async () => {
      await publish(new OrderPlacedEvent('o-2', new Date()), new ShopRequest('acme', 'u-2'));

      expect(seen.handled).toHaveLength(1);
      expect(seen.handled[0]).toBeInstanceOf(ShopRequest);
      expect(seen.handled[0]).toMatchObject({ tenantId: 'acme', userId: 'u-2' });
    });

    it('reaches the request-scoped COMMAND handler, under the same correlation id', async () => {
      const request = new ShopRequest('acme', 'u-3');

      await publish(new OrderPlacedEvent('o-3', new Date()), request);

      expect(seen.commanded).toEqual([
        { tenantId: 'acme', userId: 'u-3', correlationId: correlationIdOf(request) },
      ]);
    });

    it('is refused by the guard before anything is ingested, when the tenant is not allowed', async () => {
      await publish(new OrderPlacedEvent('o-4', new Date()), new ShopRequest('another-tenant', 'u-4'));

      expect(seen.guarded).toEqual([{ tenantId: 'another-tenant', userId: 'u-4' }]);
      expect(seen.handled).toEqual([]);
      expect(seen.commanded).toEqual([]);
    });

    it('answers a guard with no request at all when the publisher opened none', async () => {
      await publish(new OrderPlacedEvent('o-5', new Date()));

      expect(seen.guarded).toEqual([{ tenantId: undefined, userId: undefined }]);
      expect(seen.commanded).toEqual([]);
    });
  });

  describe('an event raised in this service', () => {
    it('carries the same request into the saga and the command, with nothing on the wire', async () => {
      const request = new ShopRequest('acme', 'u-6');
      const event = new OrderPlacedEvent('o-6', new Date());

      await bus.publish(event, request);
      await settle();

      expect(seen.handled[0]).toBe(request);
      expect(seen.commanded).toEqual([
        { tenantId: 'acme', userId: 'u-6', correlationId: correlationIdOf(request) },
      ]);
      expect(seen.guarded).toEqual([]);
    });
  });
});
