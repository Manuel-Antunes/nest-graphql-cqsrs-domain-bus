import type { ModuleMetadata, Provider, Type } from '@nestjs/common';

import type {
  EventSourced,
  EventSourcedClass,
} from './persistence/event-log/event-sourced.repository';
import type { MessageInbox } from './persistence/message-inbox';
import type { RequestContextCodec } from './request-context';
import type { TransportIdentity } from './transport-identity';

/** Who this service is on the wire: a name, or an identity it built itself. */
export type DeclaredIdentity = TransportIdentity | string;

/**
 * **What a service says about its transport**, and nothing it can work out for itself.
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
   * What a request means here. The default carries a correlation id and a causation id, which is what
   * a service with no notion of a request of its own needs.
   */
  readonly requestContext?: Type<RequestContextCodec>;

  /**
   * The destinations: the `@Publisher` classes and whatever they hold their clients through. They are
   * providers rather than options because a client is built by the application — that is where the
   * broker's address lives.
   */
  readonly publishers?: Provider[];

  /**
   * The inbound half, and what it remembers. Passing an inbox is what turns receiving on:
   * `MikroOrmMessageInbox` for a service with a database, `NoMessageInbox` for one that keeps no
   * memory of what it received — and then the aggregate is the only guard left.
   */
  readonly inbox?: Type<MessageInbox>;

  /**
   * The aggregates this service event-sources. Given, the {@link EventLog} is wired and each
   * aggregate gets its {@link EventSourcedRepository} — `eventStore: [Post]` is a service that
   * decides about a Post it has no table for. It is the same log {@link subscriptions} reads, because
   * an aggregate's history and the service's order are two reads of one table.
   */
  readonly eventStore?: readonly EventSourcedClass<EventSourced>[];

  /**
   * **Turns on the log-backed `EventBus`, so a subscription works across processes.**
   *
   * A `SubscriptionBus` stream is fed by the `EventBus`, which is one per process — so a service that
   * runs as several (a function per trigger, several replicas) has subscribers that cannot see what
   * the other processes published. Given, the `EventBus` token is bound to
   * {@link EventSourcedEventBus}, whose observable side is the {@link EventLog}. Nothing downstream
   * changes: a handler still pipes `EventBus`.
   *
   * A service that is one process wants none of this: the plain bus has no table and no polling in
   * the way.
   */
  readonly subscriptions?: boolean;
}

/** What the factory of {@link TransportEventBusModule.forRootAsync} answers: who this service is. */
export interface TransportEventBusIdentity {
  readonly identity: DeclaredIdentity;
  readonly publishes?: boolean;
}

/**
 * The same options, with the identity resolved at runtime — from a `ConfigService`, a secret, a
 * discovery agent.
 *
 * Only the identity is async, and that is not a limitation: everything else here is either a class or
 * a provider, and a provider resolves its own dependencies (a client factory injecting a
 * `ConfigService` is an ordinary `useFactory`). What cannot wait is module metadata, which Nest reads
 * before anything is instantiated.
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
