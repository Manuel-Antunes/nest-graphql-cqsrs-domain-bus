import type { DynamicModule, Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';

import {
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TRANSPORT_OUTBOX_DESTINATIONS,
  TRANSPORT_OUTBOX_SETTINGS,
} from './constants';
import { EventIngestion } from './inbound/event-ingestion';
import { InboxDescriptions } from './inbound/inbox-descriptions';
import { IncomingRequest } from './inbound/incoming-request';
import { EventMessages } from './outbound/event-messages';
import { EventOutbox } from './outbox/event-outbox';
import type { TransportOutboxOptions } from './outbox/transport-outbox.options';
import { EventLog, MikroOrmEventLog } from './persistence/event-log/event-log';
import { eventLogEntities } from './persistence/event-log/event-log.entity';
import { EventSourcedRepository } from './persistence/event-log/event-sourced.repository';
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
import { TransportEventBusPublisher } from './transport-event-bus.publisher';
import { TransportEventBusService } from './transport-event-bus.service';
import { TransportIdentity } from './transport-identity';
import { UnitOfWorkTransaction } from './unit-of-work/unit-of-work';
import { UnitOfWorkCommands } from './unit-of-work/unit-of-work-commands';

type Composed = Omit<TransportEventBusModuleOptions, 'identity' | 'publishes'>;

/**
 * **`@nestjs/cqrs`'s bus, with a unit of work, an event store and `@nestjs/outbox` behind it.**
 *
 * `@nestjs/cqrs` and `@nestjs/outbox` are the application's: it declares both at its root, and this
 * module uses them — the `EventBus` it publishes through, the `Outbox` and `OutboxInbox` it writes
 * to. So is the transaction its units of work run in, which the application names for its ORM.
 *
 * ```ts
 * @Module({
 *   imports: [
 *     CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
 *     DatabaseModule.forRoot(mikroOrmConfig()),
 *     OutboxModule.forRoot({
 *       imports: [PostEventsClientModule],
 *       transports: { [POSTS_NAMESPACE]: ClientProxyTransport(PostEventsClient, { toPacket: OutboxPackets.for('rabbitmq') }) },
 *       route: routeOf,
 *     }),
 *     MikroOrmOutboxModule.forRoot({ producer: 'tagging' }),
 *     TransportEventBusModule.forRoot({
 *       identity: 'tagging',
 *       transaction: MikroOrmUnitOfWorkTransaction,
 *       inbox: { descriptions: MikroOrmOutboxStore },
 *       outbox: { destinations: [POSTS_NAMESPACE] },
 *       eventStore: [Post],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * ## What it decides for the application, and what it leaves to it
 * It decides the **shape**: which providers exist, with which defaults — the request codec that
 * carries correlation, the unit of work around every command, the ingestion that only exists for a
 * service that receives, the outbox writer that only exists for one that publishes. What it leaves to
 * the application is what only the application knows: who it is, which namespaces it publishes, the
 * outbox those go through and the database everything is written to.
 *
 * ## Why it is global
 * Because what it provides is injected from everywhere in an application: a command handler asks for
 * `TRANSPORT_EVENT_BUS_PUBLISHER`, a controller for `EventIngestion`, a guard or an interceptor for
 * {@link IncomingRequest}. And because `CqsrsModule.forRoot({ aggregatePublisher: … })` resolves that
 * token from a global module — see `libs/core/cqsrs`.
 */
@Module({})
export class TransportEventBusModule {
  static forRoot(options: TransportEventBusModuleOptions): DynamicModule {
    return TransportEventBusModule.assemble(options, {
      provide: TransportIdentity,
      useValue: TransportEventBusModule.identityOf(
        options.identity,
        options.publishes,
      ),
    });
  }

  /** The same, with the identity resolved at runtime. See {@link TransportEventBusModuleAsyncOptions}. */
  static forRootAsync(
    options: TransportEventBusModuleAsyncOptions,
  ): DynamicModule {
    return TransportEventBusModule.assemble(options, {
      provide: TransportIdentity,
      inject: options.inject ?? [],
      useFactory: async (...args: unknown[]) =>
        TransportEventBusModule.identityFrom(await options.useFactory(...args)),
    });
  }

  private static assemble(
    options: Composed,
    identity: Provider,
  ): DynamicModule {
    return {
      module: TransportEventBusModule,
      global: true,
      imports: [
        ...TransportEventBusModule.tables(options),
        ...(options.imports ?? []),
      ],
      providers: [
        identity,
        {
          provide: RequestContextCodec,
          useClass: options.requestContext ?? CorrelatedRequestContext,
        },
        IncomingRequest,
        TransportEventBusService,
        TransportEventBusPublisher,
        {
          provide: TRANSPORT_EVENT_BUS_PUBLISHER,
          useExisting: TransportEventBusPublisher,
        },
        UnitOfWorkCommands,
        ...TransportEventBusModule.transaction(options),
        ...TransportEventBusModule.inbound(options),
        ...TransportEventBusModule.outbound(options),
        ...TransportEventBusModule.eventStore(options),
        ...(options.subscriptions ? [EventSourcedEventBus] : []),
        ...(options.providers ?? []),
      ],
      exports: [
        TransportEventBusService,
        TRANSPORT_EVENT_BUS_PUBLISHER,
        IncomingRequest,
        RequestContextCodec,
        ...(options.transaction ? [UnitOfWorkTransaction] : []),
        ...(options.inbox ? [EventIngestion] : []),
        ...(options.outbox ? [EventMessages, EventOutbox] : []),
        ...(TransportEventBusModule.logged(options) ? [EventLog] : []),
        ...(options.eventStore ? [EventSourcedRepository] : []),
        ...(options.subscriptions ? [EventSourcedEventBus] : []),
        ...(options.exports ?? []),
      ],
    };
  }

  /** The application's transaction, as the port every unit of work asks for. */
  private static transaction({ transaction }: Composed): Provider[] {
    return transaction
      ? [{ provide: UnitOfWorkTransaction, useClass: transaction }]
      : [];
  }

  /** {@link EventIngestion}, over the application's `OutboxInbox`, and where it describes what it admitted. */
  private static inbound({ inbox }: Composed): Provider[] {
    if (!inbox) {
      return [];
    }
    const descriptions = inbox === true ? undefined : inbox.descriptions;
    return [
      EventIngestion,
      ...(descriptions
        ? [{ provide: InboxDescriptions, useExisting: descriptions }]
        : []),
    ];
  }

  /**
   * {@link EventOutbox} and the messages it writes, over the application's `Outbox`: the namespaces
   * that leave, and how this process relays them.
   */
  private static outbound({ outbox }: Composed): Provider[] {
    return outbox
      ? [
          EventMessages,
          EventOutbox,
          {
            provide: TRANSPORT_OUTBOX_DESTINATIONS,
            useValue: [...outbox.destinations],
          },
          TransportEventBusModule.outboxSettings(outbox),
        ]
      : [];
  }

  private static outboxSettings(outbox: TransportOutboxOptions): Provider {
    return outbox.useFactory
      ? {
          provide: TRANSPORT_OUTBOX_SETTINGS,
          inject: outbox.inject ?? [],
          useFactory: outbox.useFactory,
        }
      : { provide: TRANSPORT_OUTBOX_SETTINGS, useValue: {} };
  }

  /** The {@link EventLog}, and an {@link EventSourcedRepository} per aggregate it replays. */
  private static eventStore(options: Composed): Provider[] {
    return TransportEventBusModule.logged(options)
      ? [
          { provide: EventLog, useClass: MikroOrmEventLog },
          ...(options.eventStore ?? []).map((aggregate) =>
            EventSourcedRepository.of(aggregate),
          ),
        ]
      : [];
  }

  /**
   * The one table this library owns, the event log, declared where it is needed: a service that
   * neither replays an aggregate nor serves subscriptions has none. The outbox's and the inbox's are
   * the application's, with the outbox.
   */
  private static tables(options: Composed): DynamicModule[] {
    return TransportEventBusModule.logged(options)
      ? [DatabaseModule.forFeature(eventLogEntities)]
      : [];
  }

  /** Whether this service keeps a log at all: it replays an aggregate, or it serves subscriptions. */
  private static logged(options: Composed): boolean {
    return Boolean(options.eventStore) || Boolean(options.subscriptions);
  }

  private static identityOf(
    declared: DeclaredIdentity,
    publishes?: boolean,
  ): TransportIdentity {
    return typeof declared === 'string'
      ? TransportIdentity.named(declared, { publishes })
      : declared;
  }

  private static identityFrom(
    answer: TransportEventBusIdentity | DeclaredIdentity,
  ): TransportIdentity {
    return typeof answer === 'string' || answer instanceof TransportIdentity
      ? TransportEventBusModule.identityOf(answer)
      : TransportEventBusModule.identityOf(answer.identity, answer.publishes);
  }
}
