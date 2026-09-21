import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { DatabaseModule } from '@nestposts/platform/infrastructure/persistence/database.module';
import { TRANSPORT_EVENT_BUS_PUBLISHER, TRANSPORT_EVENT_BUS_SERVICE } from './constants';
import { EventIngestion } from './inbound/event-ingestion';
import { IncomingRequest } from './inbound/incoming-request';
import { IngestionSink, NoDurableState } from './inbound/ingestion-sink';
import { TransportRequestPipe } from './inbound/transport-request.pipe';
import { EventEnvelopeFactory } from './outbound/event-envelope.factory';
import { OutboxRouting } from './outbound/outbox-routing';
import { EventSourcedRepository } from './persistence/event-store/event-sourced.repository';
import { EventStore } from './persistence/event-store/event-store';
import { eventStoreEntities } from './persistence/event-store/event-store.entity';
import { eventStoreProviders } from './persistence/event-store/event-store.providers';
import { MessageInbox } from './persistence/message-inbox';
import { transportEntities } from './persistence/message-inbox.entity';
import { CorrelatedRequestContext, RequestContextCodec } from './request-context';
import { eventIngestionProviders, transportEventBusProviders } from './transport-event-bus.providers';
import { TransportIdentity } from './transport-identity';
import type {
  DeclaredIdentity,
  TransportEventBusIdentity,
  TransportEventBusModuleAsyncOptions,
  TransportEventBusModuleOptions,
} from './transport-event-bus.options';

/**
 * **The transport, started in one call.**
 *
 * ```ts
 * @Module({
 *   imports: [
 *     CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
 *     DatabaseModule.forRoot(mikroOrmConfig()),
 *     TransportEventBusModule.forRoot({
 *       identity: taggingIdentity(),
 *       inbox: MikroOrmMessageInbox,
 *       eventStore: [Post],
 *       publishers: [
 *         PostEventsPublisher,
 *         { provide: POST_EVENTS_CLIENT, useFactory: postEventsClient },
 *       ],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * ## What it decides for the application, and what it leaves to it
 * It decides the **shape**: which providers exist, in which order, with which defaults — the request
 * codec that carries correlation, the sink that keeps nothing, the ingestion that only exists for a
 * service that receives. What it leaves to the application is what only the application knows: who it
 * is, where its destinations point, and what it makes durable.
 *
 * The three provider arrays it composes — {@link transportEventBusProviders},
 * {@link eventIngestionProviders} and {@link eventStoreProviders} — are still exported, and a service
 * that wants to compose them by hand still can. This is the opinionated way, not the only one, and the
 * library's own specs use both.
 *
 * ## Why it is global
 * Because what it provides is injected from everywhere in an application: a command handler asks for
 * `TRANSPORT_EVENT_BUS_PUBLISHER`, a controller for `EventIngestion`, a guard for
 * {@link IncomingRequest}. And because `CqsrsModule.forRoot({ aggregatePublisher: … })` resolves that
 * token from a global module — see `libs/cqsrs`.
 *
 * ## The two refusals
 * A `sink` together with an `eventStore` (both bind the same port, and the second would silently win),
 * and a `publishes` flag beside an identity that already carries one. Both throw where they are
 * written, which is the one place the mistake is visible.
 */
@Module({})
export class TransportEventBusModule {
  static forRoot(options: TransportEventBusModuleOptions): DynamicModule {
    return {
      module: TransportEventBusModule,
      global: true,
      imports: [DiscoveryModule, ...tables(options), ...(options.imports ?? [])],
      providers: [
        ...mechanism(options),
        { provide: TransportIdentity, useValue: identityOf(options.identity, options.publishes) },
      ],
      exports: [...exported(options), ...(options.exports ?? [])],
    };
  }

  /** The same, with the identity resolved at runtime. See {@link TransportEventBusModuleAsyncOptions}. */
  static forRootAsync(options: TransportEventBusModuleAsyncOptions): DynamicModule {
    return {
      module: TransportEventBusModule,
      global: true,
      imports: [DiscoveryModule, ...tables(options), ...(options.imports ?? [])],
      providers: [
        ...mechanism(options),
        {
          provide: TransportIdentity,
          inject: options.inject ?? [],
          useFactory: async (...args: unknown[]) => identityFrom(await options.useFactory(...args)),
        },
      ],
      exports: [...exported(options), ...(options.exports ?? [])],
    };
  }
}

type Composed = Omit<TransportEventBusModuleOptions, 'identity' | 'publishes'>;

/**
 * The tables this library needs, declared where they are needed: the inbox for a service that receives,
 * the streams for one that event-sources. A publish-only service gets neither, and needs no database at
 * all.
 */
const tables = (options: Composed): DynamicModule[] =>
  options.inbox || options.eventStore
    ? [
        DatabaseModule.forFeature([
          ...(options.inbox ? transportEntities : []),
          ...(options.eventStore ? eventStoreEntities : []),
        ]),
      ]
    : [];

const mechanism = (options: Composed): Provider[] => {
  refuseAmbiguity(options);

  return [
    ...transportEventBusProviders,
    { provide: RequestContextCodec, useClass: options.requestContext ?? CorrelatedRequestContext },
    ...(options.eventStore
      ? [
          ...eventStoreProviders,
          ...options.eventStore.map((aggregate) => EventSourcedRepository.of(aggregate)),
        ]
      : [{ provide: IngestionSink, useClass: options.sink ?? NoDurableState }]),
    ...(options.inbox
      ? [...eventIngestionProviders, { provide: MessageInbox, useClass: options.inbox }]
      : []),
    ...(options.publishers ?? []),
    ...(options.providers ?? []),
  ];
};

const exported = (options: Composed): NonNullable<TransportEventBusModuleOptions['exports']> => [
  TRANSPORT_EVENT_BUS_SERVICE,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  EventEnvelopeFactory,
  OutboxRouting,
  IncomingRequest,
  TransportRequestPipe,
  RequestContextCodec,
  ...(options.inbox ? [EventIngestion, MessageInbox] : []),
  ...(options.eventStore ? [EventStore, EventSourcedRepository] : []),
];

const identityOf = (declared: DeclaredIdentity, publishes?: boolean): TransportIdentity =>
  typeof declared === 'string' ? TransportIdentity.named(declared, { publishes }) : declared;

const identityFrom = (answer: TransportEventBusIdentity | DeclaredIdentity): TransportIdentity =>
  typeof answer === 'string' || answer instanceof TransportIdentity
    ? identityOf(answer)
    : identityOf(answer.identity, answer.publishes);

const refuseAmbiguity = (options: Composed): void => {
  if (options.eventStore && options.sink) {
    throw new Error(
      `TransportEventBusModule was given both a sink (${options.sink.name}) and an eventStore: they ` +
        `bind the same port, and one of them would quietly never run. An event-sourced service makes ` +
        `the stream durable — drop the sink, or drop the eventStore and append in your own.`,
    );
  }
};
