import type { InjectionToken, ModuleMetadata, Type } from '@nestjs/common';

import type { ProcessingGroupsOptions } from './eventhandling/processing-groups';
import type { SequencingPolicy } from './eventhandling/sequencing-policy';
import type { EventSourcedEntityDefinition } from './eventsourcing/event-sourcing.repository';
import type { EventStorageEngine } from './eventsourcing/event-storage-engine';
import type { TagResolver } from './eventsourcing/tag';
import type { InboxDescriptions } from './inbound/inbox-descriptions';
import type { CorrelationDataProvider } from './messaging/correlation';
import type {
  MessageDispatchInterceptor,
  MessageHandlerInterceptor,
} from './messaging/interception';
import type { TransportOutboxOptions } from './outbox/transport-outbox.options';
import type { RequestContextCodec } from './request-context';
import type { TransportIdentity } from './transport-identity';
import type { TransactionManagerLike } from './unit-of-work/transaction-manager';

/** Who this service is on the wire: a name, or an identity it built itself. */
export type DeclaredIdentity = TransportIdentity | string;

/** The inbound half, when it says more than "on". */
export interface TransportInboxOptions {
  /**
   * Where each admitted message's type and origin are noted, beside the inbox's record — see
   * {@link InboxDescriptions}. A provider some module already exports: `MikroOrmOutboxStore`.
   */
  readonly descriptions?: InjectionToken<InboxDescriptions>;
}

/** The event store: where it is kept, and the entities this service sources from it. */
export interface TransportEventStoreOptions {
  /**
   * The {@link EventStorageEngine}, as a provider some module already exports —
   * `MikroOrmEventStorageEngine`, which `MikroOrmEventStoreModule` provides with its table.
   */
  readonly engine: InjectionToken<EventStorageEngine>;
  /** An `EventSourcingRepository` for each — `{ entity: Post, tagKey: 'postId' }`. */
  readonly entities?: readonly EventSourcedEntityDefinition[];
}

/**
 * **What a service says about its messaging**, and nothing it can work out for itself.
 *
 * Everything here is optional except {@link identity}, because a service's own name is the one thing
 * that has no sensible default — it is the mark of authorship every message carries, and the inbound
 * half's answer to "did I send this?".
 */
export interface TransportEventBusModuleOptions
  extends Pick<ModuleMetadata, 'imports' | 'providers' | 'exports'> {
  /**
   * `'posts-api'`, or a {@link TransportIdentity} of its own
   * (`TransportIdentity.silent('posts-api-spec')` for a suite).
   */
  readonly identity: DeclaredIdentity;

  /** The master switch of the outbound half. Only with a plain name — an identity carries its own. */
  readonly publishes?: boolean;

  /**
   * **The transaction every unit of work runs in** — Axon 5's `TransactionManager`, for the ORM the
   * application uses: `MikroOrmTransactionManager`. The outbox, the inbox and the event store write
   * through it. Without one every write commits on its own, which a service with neither an inbox nor
   * an outbox nor an event store can afford and one with any of them cannot.
   */
  readonly transactionManager?: Type<TransactionManagerLike>;

  /**
   * What `@nestjs/cqrs`'s request means here, both ways — see {@link RequestContextCodec}. The default
   * turns a context's `toAttributes()` into metadata and a message into a `TransportRequestContext`.
   */
  readonly requestContext?: Type<RequestContextCodec>;

  /**
   * What a handled message passes on to everything its handler dispatches — Axon 5's
   * `CorrelationDataProvider`s. By default `MessageOriginProvider` (the correlation and causation
   * ids) and `ForwardedMetadataProvider` (every key the application put on the message).
   */
  readonly correlationDataProviders?: readonly Type<CorrelationDataProvider>[];

  /** Run on every message as it is dispatched, after the correlation data and the trace. */
  readonly dispatchInterceptors?: readonly Type<MessageDispatchInterceptor>[];

  /** Run around every message as it is handled, inside the correlation data's branch. */
  readonly handlerInterceptors?: readonly Type<MessageHandlerInterceptor>[];

  /** Which tags an event carries. By default the ones `@EventType({ tags })` declares. */
  readonly tagResolver?: Type<TagResolver>;

  /**
   * Which events are published and handled in order. By default per entity (the first tag) and every
   * untagged event in one sequence — Axon 5's default.
   */
  readonly sequencingPolicy?: Type<SequencingPolicy>;

  /**
   * The processing groups that are not the default — **subscribing**, with a propagating error
   * handler. `{ notifications: 'streaming' }` delivers that group's events through the outbox, after
   * the commit, each in a unit of its own; it needs an {@link outbox}.
   */
  readonly processingGroups?: ProcessingGroupsOptions;

  /**
   * **The inbound half.** `true` turns receiving on: `EventIngestion` admits each message through
   * `@nestjs/outbox`'s inbox, keyed by this service's name and the message's identifier, in the
   * transaction of everything the message causes. It needs the application's `OutboxModule` and a
   * {@link transactionManager}.
   */
  readonly inbox?: boolean | TransportInboxOptions;

  /**
   * **The outbound half.** What leaves the process is a message of `@nestjs/outbox`, written in the
   * unit of work's transaction and published by the outbox's relay once it committed. See
   * {@link TransportOutboxOptions}; the outbox itself is the application's `OutboxModule`. Without it
   * nothing leaves, and no processing group can be streaming.
   */
  readonly outbox?: TransportOutboxOptions;

  /**
   * **The event store** — Axon 5's `EventStore`, on the application's engine. Every event a unit
   * publishes or ingests is appended to it in `PREPARE_COMMIT`, and each entity listed gets its
   * `EventSourcingRepository`.
   */
  readonly eventStore?: TransportEventStoreOptions;

  /**
   * **Subscriptions across processes.** A `SubscriptionBus` stream is fed by the `EventBus`, which is
   * one per process; given, the `EventBus`'s observable side reads the {@link eventStore} instead, so a
   * subscriber sees what every process published. It needs an event store.
   */
  readonly subscriptions?: boolean;
}

/** What the factory of `TransportEventBusModule.forRootAsync` answers: who this service is. */
export interface TransportEventBusIdentity {
  readonly identity: DeclaredIdentity;
  readonly publishes?: boolean;
}

/**
 * The same options, with the identity resolved at runtime — from a `ConfigService`, a secret, a
 * discovery agent. Everything else is either a class or a provider, and a provider resolves its own
 * dependencies; what cannot wait is module metadata, which Nest reads before anything is instantiated.
 */
export interface TransportEventBusModuleAsyncOptions
  extends Omit<TransportEventBusModuleOptions, 'identity' | 'publishes'> {
  readonly inject?: any[];
  readonly useFactory: (
    ...args: any[]
  ) =>
    | Promise<TransportEventBusIdentity | DeclaredIdentity>
    | TransportEventBusIdentity
    | DeclaredIdentity;
}
