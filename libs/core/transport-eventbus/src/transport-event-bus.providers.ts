import type { Provider } from '@nestjs/common';

import {
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TRANSPORT_EVENT_BUS_SERVICE,
} from './constants';
import { EventIngestion } from './inbound/event-ingestion';
import { IncomingRequest } from './inbound/incoming-request';
import { TransportRequestPipe } from './inbound/transport-request.pipe';
import { TransportEventBusPublisher } from './transport-event-bus.publisher';
import { TransportEventBusService } from './transport-event-bus.service';

/**
 * **The bus, as providers**: the `IEventBus` and the `EventPublisher` bound to it, and what a guard or
 * a controller reads a message's request with. `TransportEventBusModule.forRoot(...)` composes them
 * with a {@link TransportIdentity} and a {@link RequestContextCodec}, and — for a service that keeps
 * an inbox or an outbox — with `@nestjs/outbox` and its MikroORM store. They are still exported for a
 * spec that composes a publish-only bus by hand.
 */
export const transportEventBusProviders: readonly Provider[] = [
  IncomingRequest,
  TransportRequestPipe,
  TransportEventBusService,
  {
    provide: TRANSPORT_EVENT_BUS_SERVICE,
    useExisting: TransportEventBusService,
  },
  TransportEventBusPublisher,
  {
    provide: TRANSPORT_EVENT_BUS_PUBLISHER,
    useExisting: TransportEventBusPublisher,
  },
];

/**
 * **The inbound half**, for a service that receives: {@link EventIngestion}, which needs an
 * `EntityManager`, `@nestjs/outbox`'s `OutboxInbox` over a registered store and a
 * {@link UnitOfWorkTransaction}. An {@link EventLog}, if one is bound, is appended **inside the
 * ingestion's transaction**: what arrived is remembered before anything reacts to it.
 */
export const eventIngestionProviders: readonly Provider[] = [EventIngestion];
