import type { Provider } from '@nestjs/common';
import { TRANSPORT_EVENT_BUS_PUBLISHER, TRANSPORT_EVENT_BUS_SERVICE } from './constants';
import { EventIngestion } from './inbound/event-ingestion';
import { IncomingRequest } from './inbound/incoming-request';
import { TransportRequestPipe } from './inbound/transport-request.pipe';
import { EventEnvelopeFactory } from './outbound/event-envelope.factory';
import { EventForwarder } from './outbound/event-forwarder';
import { OutboxRouting } from './outbound/outbox-routing';
import { TransportEventBusPublisher } from './transport-event-bus.publisher';
import { TransportEventBusService } from './transport-event-bus.service';

/**
 * **The mechanism, as providers an application declares in its own module.**
 *
 * There is no `TransportEventBusModule.forRoot(...)`, and the absence is the design: a root module
 * function is a second way of wiring, one that takes an options literal instead of a class and that
 * nothing can substitute in a test. What this library needs from an application is four **beans**, and
 * asking for them the way everything else in this repository asks — an abstract class, bound in the
 * composition root — is both less code here and less magic there:
 *
 * ```ts
 * @Global()
 * @Module({
 *   imports: [DiscoveryModule],
 *   providers: [
 *     ...transportEventBusProviders,
 *     { provide: TransportIdentity, useValue: TransportIdentity.named('posts-api') },
 *     { provide: RequestContextCodec, useClass: PostRequestContextCodec },
 *     { provide: MessageInbox, useClass: MikroOrmMessageInbox },
 *     PostEventsPublisher,
 *     { provide: POST_EVENTS_CLIENT, useFactory: postEventsClient },
 *   ],
 *   exports: [TRANSPORT_EVENT_BUS_SERVICE, TRANSPORT_EVENT_BUS_PUBLISHER, EventIngestion, OutboxRouting],
 * })
 * export class TransportModule {}
 * ```
 *
 * The bindings are {@link TransportIdentity} (who this service is) and {@link RequestContextCodec}
 * (what a request means here) — the second with `CorrelatedRequestContext` to bind when correlation
 * and causation are all that need to cross.
 *
 * A service that also **receives** adds {@link eventIngestionProviders} and the one binding the
 * inbound half needs:
 * {@link MessageInbox} (`MikroOrmMessageInbox`, or `NoMessageInbox` when it keeps no memory). They are
 * a separate array because publishing needs no database, and a service that only publishes should not
 * have to have one.
 *
 * `DiscoveryModule` is Nest's own, and it is what finds the `@Publisher` classes wherever they are
 * declared.
 */
export const transportEventBusProviders: readonly Provider[] = [
  OutboxRouting,
  EventEnvelopeFactory,
  IncomingRequest,
  TransportRequestPipe,
  EventForwarder,
  TransportEventBusService,
  { provide: TRANSPORT_EVENT_BUS_SERVICE, useExisting: TransportEventBusService },
  TransportEventBusPublisher,
  { provide: TRANSPORT_EVENT_BUS_PUBLISHER, useExisting: TransportEventBusPublisher },
];

/**
 * **The inbound half**, for a service that receives: {@link EventIngestion}, which needs an
 * `EntityManager` and a {@link MessageInbox} bound alongside it. An {@link EventLog}, if one is
 * bound, is appended **inside the ingestion's transaction**: what arrived is remembered before
 * anything reacts to it.
 */
export const eventIngestionProviders: readonly Provider[] = [EventIngestion];
