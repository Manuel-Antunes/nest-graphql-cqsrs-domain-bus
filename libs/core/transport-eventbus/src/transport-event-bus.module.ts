import type {
  DynamicModule,
  InjectionToken,
  Provider,
  Type,
} from '@nestjs/common';
import { Module } from '@nestjs/common';

import {
  CORRELATION_DATA_PROVIDERS,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TRANSPORT_OUTBOX_DESTINATIONS,
  TRANSPORT_OUTBOX_SETTINGS,
} from './constants';
import { CommittedEvents } from './eventhandling/committed-events';
import { EventHandlingComponents } from './eventhandling/event-handling-components';
import { LocalEventDelivery } from './eventhandling/local-event-delivery';
import {
  PROCESSING_GROUPS_OPTIONS,
  ProcessingGroups,
} from './eventhandling/processing-groups';
import {
  DefaultSequencingPolicy,
  SequencingPolicy,
} from './eventhandling/sequencing-policy';
import { EventSourcingRepository } from './eventsourcing/event-sourcing.repository';
import { EventStorageEngine } from './eventsourcing/event-storage-engine';
import { EventStore } from './eventsourcing/event-store';
import { AnnotationBasedTagResolver, TagResolver } from './eventsourcing/tag';
import { EventIngestion } from './inbound/event-ingestion';
import { InboxDescriptions } from './inbound/inbox-descriptions';
import { IncomingRequest } from './inbound/incoming-request';
import type { CorrelationDataProvider } from './messaging/correlation';
import {
  CorrelationDataInterceptor,
  ForwardedMetadataProvider,
  MessageOriginProvider,
} from './messaging/correlation';
import type {
  MessageDispatchInterceptor,
  MessageHandlerInterceptor,
} from './messaging/interception';
import { MessageInterceptors } from './messaging/message-interceptors';
import { EventMessages } from './outbound/event-messages';
import { EventOutbox } from './outbox/event-outbox';
import { StreamingGroupDelivery } from './outbox/streaming-group-delivery';
import type { TransportOutboxOptions } from './outbox/transport-outbox.options';
import {
  DefaultRequestContextCodec,
  RequestContextCodec,
} from './request-context';
import { EventSourcedEventBus } from './subscriptions/event-sourced-event-bus';
import { TraceContextDispatchInterceptor } from './tracing';
import type {
  DeclaredIdentity,
  TransportEventBusIdentity,
  TransportEventBusModuleAsyncOptions,
  TransportEventBusModuleOptions,
} from './transport-event-bus.options';
import { TransportEventBusPublisher } from './transport-event-bus.publisher';
import { TransportEventBusService } from './transport-event-bus.service';
import { TransportIdentity } from './transport-identity';
import type { TransactionManagerLike } from './unit-of-work/transaction-manager';
import {
  NoTransactionManager,
  TransactionManager,
} from './unit-of-work/transaction-manager';
import { UnitOfWorkCommands } from './unit-of-work/unit-of-work-commands';
import {
  TransactionalUnitOfWorkFactory,
  UnitOfWorkFactory,
} from './unit-of-work/unit-of-work-factory';

type Composed = Omit<TransportEventBusModuleOptions, 'identity' | 'publishes'>;

/**
 * **Axon 5's messaging on top of `@nestjs/cqrs` and `@nestjs/outbox`**: a unit of work around every
 * command and every delivered message, an `EventSink` that stages what they publish and writes it in
 * `PREPARE_COMMIT`, subscribing and streaming processing groups, an event store with dynamic
 * consistency boundaries, and the outbox and the inbox behind it all.
 *
 * `@nestjs/cqrs`, `@nestjs/outbox` and the database are the application's: it declares them at its
 * root, and this module uses them — the `EventBus` it delivers through, the `Outbox` and `OutboxInbox`
 * it writes to, the transaction manager and the storage engine for its ORM.
 *
 * ```ts
 * @Module({
 *   imports: [
 *     CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
 *     DatabaseModule.forRoot(),
 *     OutboxModule.forRootAsync({ imports: [PostEventsClientModule], transports, useFactory: … }),
 *     MikroOrmOutboxModule.forRootAsync(…),
 *     MikroOrmEventStoreModule,
 *     TransportEventBusModule.forRootAsync({
 *       useFactory: ({ name }: AppConfig) => TransportIdentity.named(name),
 *       inject: [appConfig.KEY],
 *       transactionManager: MikroOrmTransactionManager,
 *       inbox: { descriptions: MikroOrmOutboxStore },
 *       outbox: { destinations: PostEventsClient.namespaces, … },
 *       eventStore: { engine: MikroOrmEventStorageEngine, entities: [{ entity: Post, tagKey: 'postId' }] },
 *       processingGroups: { notifications: 'streaming' },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * It is global, because what it provides is injected from everywhere — a command handler asks for
 * `TRANSPORT_EVENT_BUS_PUBLISHER`, a controller for `EventIngestion`, a guard for `IncomingRequest`
 * — and because `CqsrsModule.forRoot({ aggregatePublisher })` resolves that token from a global module.
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

  /** The same, with the identity resolved at runtime. */
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
    TransportEventBusModule.validate(options);
    return {
      module: TransportEventBusModule,
      global: true,
      imports: [...(options.imports ?? [])],
      providers: [
        identity,
        {
          provide: RequestContextCodec,
          useClass: options.requestContext ?? DefaultRequestContextCodec,
        },
        IncomingRequest,
        ...TransportEventBusModule.messaging(options),
        ...TransportEventBusModule.unitsOfWork(options),
        ...TransportEventBusModule.eventHandling(options),
        TransportEventBusService,
        TransportEventBusPublisher,
        {
          provide: TRANSPORT_EVENT_BUS_PUBLISHER,
          useExisting: TransportEventBusPublisher,
        },
        ...TransportEventBusModule.inbound(options),
        ...TransportEventBusModule.outbound(options),
        ...TransportEventBusModule.eventStore(options),
        ...(options.providers ?? []),
      ],
      exports: [
        TransportEventBusService,
        TRANSPORT_EVENT_BUS_PUBLISHER,
        IncomingRequest,
        RequestContextCodec,
        MessageInterceptors,
        UnitOfWorkFactory,
        TagResolver,
        SequencingPolicy,
        EventMessages,
        ProcessingGroups,
        ...(options.transactionManager ? [TransactionManager] : []),
        ...(options.inbox ? [EventIngestion] : []),
        ...(options.outbox ? [EventOutbox] : []),
        ...(options.eventStore ? [EventStore] : []),
        ...(options.eventStore?.entities ?? []).map(
          (definition) => definition.token ?? EventSourcingRepository,
        ),
        ...(options.subscriptions ? [EventSourcedEventBus] : []),
        ...(options.exports ?? []),
      ],
    };
  }

  private static validate(options: Composed): void {
    const streaming = Object.values(options.processingGroups ?? {}).some(
      (group) =>
        group === 'streaming' ||
        (typeof group === 'object' && group.processor === 'streaming'),
    );
    if (streaming && !options.outbox) {
      throw new Error(
        'TransportEventBusModule: a streaming processing group is delivered through the outbox — ' +
          'declare `outbox` (and the root OutboxModule), or make the group subscribing',
      );
    }
    if (options.subscriptions && !options.eventStore) {
      throw new Error(
        'TransportEventBusModule: `subscriptions` read the event store — declare `eventStore`',
      );
    }
  }

  /**
   * The correlation data providers, the tag resolver and the sequencing policy, and the interceptors
   * built from them: `CorrelationDataInterceptor` first, the trace next, the application's after.
   */
  private static messaging(options: Composed): Provider[] {
    const providers = options.correlationDataProviders ?? [
      MessageOriginProvider,
      ForwardedMetadataProvider,
    ];
    const dispatch = options.dispatchInterceptors ?? [];
    const handler = options.handlerInterceptors ?? [];
    const declared = [
      ...new Set<Type<unknown>>([...providers, ...dispatch, ...handler]),
    ];
    return [
      ...declared,
      {
        provide: CORRELATION_DATA_PROVIDERS,
        inject: [...providers],
        useFactory: (...resolved: CorrelationDataProvider[]) => resolved,
      },
      {
        provide: MessageInterceptors,
        inject: [CORRELATION_DATA_PROVIDERS, ...dispatch, ...handler],
        useFactory: (
          correlation: CorrelationDataProvider[],
          ...interceptors: unknown[]
        ) => {
          const correlating = new CorrelationDataInterceptor(correlation);
          return new MessageInterceptors(
            [
              correlating,
              new TraceContextDispatchInterceptor(),
              ...(interceptors.slice(
                0,
                dispatch.length,
              ) as MessageDispatchInterceptor[]),
            ],
            [
              correlating,
              ...(interceptors.slice(
                dispatch.length,
              ) as MessageHandlerInterceptor[]),
            ],
          );
        },
      },
      {
        provide: TagResolver,
        useClass: options.tagResolver ?? AnnotationBasedTagResolver,
      },
      {
        provide: SequencingPolicy,
        useClass: options.sequencingPolicy ?? DefaultSequencingPolicy,
      },
      EventMessages,
    ];
  }

  /** The application's transaction manager, and the factory every unit of work comes from. */
  private static unitsOfWork({ transactionManager }: Composed): Provider[] {
    return [
      ...(transactionManager
        ? [
            transactionManager,
            {
              provide: TransactionManager,
              inject: [transactionManager],
              useFactory: (manager: TransactionManagerLike) =>
                TransactionManager.from(manager),
            },
          ]
        : []),
      {
        provide: UnitOfWorkFactory,
        inject: [{ token: TransactionManager, optional: true }],
        useFactory: (manager?: TransactionManager) =>
          new TransactionalUnitOfWorkFactory(
            manager ?? new NoTransactionManager(),
          ),
      },
      UnitOfWorkCommands,
    ];
  }

  /**
   * The processing groups, the handlers they are made of, the subscribing delivery, and what the
   * subscriptions read: committed events, or the event store across processes.
   */
  private static eventHandling(options: Composed): Provider[] {
    return [
      {
        provide: PROCESSING_GROUPS_OPTIONS,
        useValue: options.processingGroups ?? {},
      },
      ProcessingGroups,
      EventHandlingComponents,
      LocalEventDelivery,
      ...(options.subscriptions ? [EventSourcedEventBus] : [CommittedEvents]),
    ];
  }

  /** {@link EventIngestion}, over the application's `OutboxInbox`, and where it describes what it admitted. */
  private static inbound({ inbox }: Composed): Provider[] {
    if (!inbox) {
      return [];
    }
    const descriptions = inbox === true ? undefined : inbox.descriptions;
    return [
      EventIngestion,
      ...TransportEventBusModule.descriptions(descriptions),
    ];
  }

  /**
   * {@link EventOutbox} over the application's `Outbox`, and the {@link StreamingGroupDelivery} its
   * streaming processing groups are delivered by.
   */
  private static outbound({ outbox }: Composed): Provider[] {
    return outbox
      ? [
          EventOutbox,
          StreamingGroupDelivery,
          {
            provide: TRANSPORT_OUTBOX_DESTINATIONS,
            useValue: [...outbox.destinations],
          },
          TransportEventBusModule.outboxSettings(outbox),
        ]
      : [];
  }

  private static descriptions(
    token: InjectionToken<InboxDescriptions> | undefined,
  ): Provider[] {
    return token ? [{ provide: InboxDescriptions, useExisting: token }] : [];
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

  /** The {@link EventStore} on the application's engine, and a repository per entity it sources. */
  private static eventStore({ eventStore }: Composed): Provider[] {
    return eventStore
      ? [
          { provide: EventStorageEngine, useExisting: eventStore.engine },
          EventStore,
          ...(eventStore.entities ?? []).map((definition) =>
            EventSourcingRepository.of(definition),
          ),
        ]
      : [];
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
