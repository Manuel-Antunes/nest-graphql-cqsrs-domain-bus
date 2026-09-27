import { EntityManager } from '@mikro-orm/core';
import type { DynamicModule, Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';
import type { OutboxModuleOptions } from '@nestjs/outbox';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { UnitOfWorkTransaction } from '@nestposts/cqsrs';
import { DatabaseModule } from '@nestposts/database';

import {
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TRANSPORT_EVENT_BUS_SERVICE,
  TRANSPORT_OUTBOX_DESTINATIONS,
  TRANSPORT_OUTBOX_SETTINGS,
} from './constants';
import { EventIngestion } from './inbound/event-ingestion';
import { IncomingRequest } from './inbound/incoming-request';
import { TransportRequestPipe } from './inbound/transport-request.pipe';
import { EventMessages, routeOf } from './outbound/event-messages';
import { EventOutbox } from './outbox/event-outbox';
import { OutboxHousekeeping } from './outbox/outbox-housekeeping';
import type { TransportOutboxSettings } from './outbox/transport-outbox.options';
import { EventLog } from './persistence/event-log/event-log';
import { eventLogEntities } from './persistence/event-log/event-log.entity';
import { eventLogProviders } from './persistence/event-log/event-log.providers';
import { EventSourcedRepository } from './persistence/event-log/event-sourced.repository';
import { MikroOrmUnitOfWorkTransaction } from './persistence/mikro-orm-unit-of-work.transaction';
import { MikroOrmOutboxStore } from './persistence/outbox/mikro-orm-outbox.store';
import { outboxEntities } from './persistence/outbox/outbox.entities';
import {
  CorrelatedRequestContext,
  RequestContextCodec,
} from './request-context';
import { EventSourcedEventBus } from './subscriptions/event-sourced-event-bus';
import type {
  DeclaredIdentity,
  TransportEventBusIdentity,
  TransportEventBusModuleAsyncOptions,
  TransportEventBusModuleOptions,
} from './transport-event-bus.options';
import {
  eventIngestionProviders,
  transportEventBusProviders,
} from './transport-event-bus.providers';
import { TransportIdentity } from './transport-identity';

/**
 * **The transport, started in one call.**
 *
 * ```ts
 * @Module({
 *   imports: [
 *     CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
 *     DatabaseModule.forRoot(mikroOrmConfig()),
 *     TransportEventBusModule.forRoot({
 *       identity: 'tagging',
 *       inbox: true,
 *       outbox: {
 *         imports: [PostEventsClientModule],
 *         destinations: {
 *           [POSTS_NAMESPACE]: ClientProxyTransport(PostEventsClient, {
 *             toPacket: OutboxPackets.for('rabbitmq'),
 *           }),
 *         },
 *         inject: [outboxConfig.KEY],
 *         useFactory: (outbox: OutboxConfig) => outbox,
 *       },
 *       eventStore: [Post],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * ## What it decides for the application, and what it leaves to it
 * It decides the **shape**: which providers exist, with which defaults — the request codec that
 * carries correlation, the ingestion that only exists for a service that receives, and
 * `@nestjs/outbox` with its MikroORM store for a service that keeps an inbox or an outbox. What it
 * leaves to the application is what only the application knows: who it is, which namespaces it
 * publishes and through which client, and what it makes durable.
 *
 * ## The inbox and the outbox are `@nestjs/outbox`'s
 * Either one imports `OutboxModule`, registers {@link MikroOrmOutboxStore} as both its stores, maps
 * its three tables and binds {@link UnitOfWorkTransaction}, so every unit of work — a command, an
 * ingested message — runs in a transaction. The outbox's `transports` are the application's
 * `destinations`, one `ClientProxyTransport` per namespace, and its `route` reads the namespace off
 * each message ({@link routeOf}): the event's `@EventType` is the only declaration of where it goes.
 *
 * ## Why it is global
 * Because what it provides is injected from everywhere in an application: a command handler asks for
 * `TRANSPORT_EVENT_BUS_PUBLISHER`, a controller for `EventIngestion`, a guard for
 * {@link IncomingRequest}. And because `CqsrsModule.forRoot({ aggregatePublisher: … })` resolves that
 * token from a global module — see `libs/core/cqsrs`.
 */
@Module({})
export class TransportEventBusModule {
  static forRoot(options: TransportEventBusModuleOptions): DynamicModule {
    return {
      module: TransportEventBusModule,
      global: true,
      imports: [
        ...tables(options),
        ...reliability(options),
        ...(options.imports ?? []),
      ],
      providers: [
        ...mechanism(options),
        {
          provide: TransportIdentity,
          useValue: identityOf(options.identity, options.publishes),
        },
      ],
      exports: [...exported(options), ...(options.exports ?? [])],
    };
  }

  /** The same, with the identity resolved at runtime. See {@link TransportEventBusModuleAsyncOptions}. */
  static forRootAsync(
    options: TransportEventBusModuleAsyncOptions,
  ): DynamicModule {
    return {
      module: TransportEventBusModule,
      global: true,
      imports: [
        ...tables(options),
        ...reliability(options),
        ...(options.imports ?? []),
      ],
      providers: [
        ...mechanism(options),
        {
          provide: TransportIdentity,
          inject: options.inject ?? [],
          useFactory: async (...args: unknown[]) =>
            identityFrom(await options.useFactory(...args)),
        },
      ],
      exports: [...exported(options), ...(options.exports ?? [])],
    };
  }
}

type Composed = Omit<TransportEventBusModuleOptions, 'identity' | 'publishes'>;

/**
 * The tables this library needs, declared where they are needed: the inbox and the outbox for a
 * service that keeps either, the streams for one that event-sources. A publish-only service with no
 * outbox gets none, and needs no database at all.
 */
const tables = (options: Composed): DynamicModule[] =>
  durable(options) || logged(options)
    ? [
        DatabaseModule.forFeature([
          ...(durable(options) ? outboxEntities : []),
          ...(logged(options) ? eventLogEntities : []),
        ]),
      ]
    : [];

/** Whether this service keeps an inbox or an outbox — and so `@nestjs/outbox` and its store. */
const durable = (options: Composed): boolean =>
  Boolean(options.inbox) || Boolean(options.outbox);

/**
 * `@nestjs/outbox`, configured from the application's {@link TransportOutboxSettings}: the
 * destinations are its transports and the event's namespace is its route; the relay polls only in
 * `poll` mode and only when there is somewhere to publish.
 */
const reliability = (options: Composed): DynamicModule[] =>
  durable(options)
    ? [
        OutboxModule.forRootAsync({
          imports: options.outbox?.imports ?? [],
          transports: { ...destinationsOf(options) },
          inject: [TRANSPORT_OUTBOX_SETTINGS],
          useFactory: (settings: TransportOutboxSettings) =>
            outboxModuleOptions(
              settings,
              Object.keys(destinationsOf(options)).length > 0,
            ),
        }),
      ]
    : [];

const destinationsOf = (options: Composed) =>
  options.outbox?.destinations ?? {};

const outboxModuleOptions = (
  settings: TransportOutboxSettings,
  relays: boolean,
): OutboxModuleOptions => ({
  ...(relays ? { route: routeOf } : {}),
  relay: {
    enabled: relays && (settings.relay ?? 'poll') === 'poll',
    pollInterval: settings.pollInterval,
    batchSize: settings.batchSize,
    lease: settings.lease,
    publishTimeout: settings.publishTimeout,
    concurrency: settings.concurrency,
  },
  retry: settings.retry,
});

const settingsOf = (options: Composed): Provider =>
  options.outbox?.useFactory
    ? {
        provide: TRANSPORT_OUTBOX_SETTINGS,
        inject: options.outbox.inject ?? [],
        useFactory: options.outbox.useFactory,
      }
    : { provide: TRANSPORT_OUTBOX_SETTINGS, useValue: {} };

const reliabilityProviders = (options: Composed): Provider[] =>
  durable(options)
    ? [
        settingsOf(options),
        {
          provide: TRANSPORT_OUTBOX_DESTINATIONS,
          useValue: Object.keys(destinationsOf(options)),
        },
        {
          provide: MikroOrmOutboxStore,
          inject: [EntityManager, TransportIdentity, OutboxStorage],
          useFactory: (
            em: EntityManager,
            identity: TransportIdentity,
            storage: OutboxStorage,
          ) => new MikroOrmOutboxStore(em, identity.applicationName, storage),
        },
        {
          provide: UnitOfWorkTransaction,
          useClass: MikroOrmUnitOfWorkTransaction,
        },
        ...(options.outbox ? [EventMessages, EventOutbox] : []),
        OutboxHousekeeping,
      ]
    : [];

/** Whether this service keeps a log at all: it replays an aggregate, or it serves subscriptions. */
const logged = (options: Composed): boolean =>
  Boolean(options.eventStore) || Boolean(options.subscriptions);

const mechanism = (options: Composed): Provider[] => [
  ...transportEventBusProviders,
  {
    provide: RequestContextCodec,
    useClass: options.requestContext ?? CorrelatedRequestContext,
  },
  ...(logged(options) ? eventLogProviders : []),
  ...(options.eventStore ?? []).map((aggregate) =>
    EventSourcedRepository.of(aggregate),
  ),
  ...reliabilityProviders(options),
  ...(options.inbox ? eventIngestionProviders : []),
  ...(options.subscriptions ? [EventSourcedEventBus] : []),
  ...(options.providers ?? []),
];

const exported = (
  options: Composed,
): NonNullable<TransportEventBusModuleOptions['exports']> => [
  TRANSPORT_EVENT_BUS_SERVICE,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  IncomingRequest,
  TransportRequestPipe,
  RequestContextCodec,
  ...(options.inbox ? [EventIngestion] : []),
  ...(durable(options)
    ? [
        MikroOrmOutboxStore,
        UnitOfWorkTransaction,
        OutboxHousekeeping,
        TRANSPORT_OUTBOX_SETTINGS,
      ]
    : []),
  ...(options.outbox ? [EventMessages, EventOutbox] : []),
  ...(logged(options) ? [EventLog] : []),
  ...(options.eventStore ? [EventSourcedRepository] : []),
  ...(options.subscriptions ? [EventSourcedEventBus] : []),
];

const identityOf = (
  declared: DeclaredIdentity,
  publishes?: boolean,
): TransportIdentity =>
  typeof declared === 'string'
    ? TransportIdentity.named(declared, { publishes })
    : declared;

const identityFrom = (
  answer: TransportEventBusIdentity | DeclaredIdentity,
): TransportIdentity =>
  typeof answer === 'string' || answer instanceof TransportIdentity
    ? identityOf(answer)
    : identityOf(answer.identity, answer.publishes);
