import type { ModuleMetadata, Type } from '@nestjs/common';
import type {
  Duration,
  OutboxModuleOptions,
  OutboxTransport,
} from '@nestjs/outbox';

/**
 * **How this process takes part in publishing what the outbox holds.**
 *
 * | | the relay | after a unit of work commits |
 * |---|---|---|
 * | `poll` | polls in this process | wakes it (`notify()`) |
 * | `drain` | never polls | publishes what is due before the unit answers |
 * | `off` | never polls | nothing: another process relays |
 *
 * `poll` is a long-lived process. `drain` is a function, which is frozen the moment it answers and
 * so can have no loop: the command's own promise covers the publish, the way it covered the emit
 * before, and whatever a failure leaves behind is published by the next unit or by a scheduled
 * {@link OutboxHousekeeping.sweep}. `off` is an API-only instance beside relay workers.
 */
export type OutboxRelayMode = 'poll' | 'drain' | 'off';

/** What an application decides about its outbox. Every field has a default. */
export interface TransportOutboxSettings {
  /** See {@link OutboxRelayMode}. Default `poll`. */
  readonly relay?: OutboxRelayMode;
  /** The wait between two polls of an idle relay. Default `1s`. */
  readonly pollInterval?: Duration;
  /** Messages claimed per poll. Default `100`. */
  readonly batchSize?: number;
  /** How long a claim is exclusive. Default `30s`. */
  readonly lease?: Duration;
  /** A publish that takes longer is a failed attempt. Default a third of {@link lease}. */
  readonly publishTimeout?: Duration;
  /** Keys published side by side within a batch. Default `10`. */
  readonly concurrency?: number;
  /**
   * Attempts and backoff before a message is dead-lettered. The package's default is 20 attempts,
   * 30 to 60 minutes in all: size it to how long a broker can be down.
   */
  readonly retry?: OutboxModuleOptions['retry'];
  /**
   * How long an inbox remembers a message it processed — longer than any redelivery, a dead letter's
   * requeue included. Default `30d`.
   */
  readonly inboxRetention?: Duration;
  /** How often a `poll` process prunes the inbox and checks the outbox's health. Default `1h`. */
  readonly housekeeping?: Duration;
  /** A due message that waited longer than this is reported, with the outbox's counts. Default `1m`. */
  readonly lagWarning?: Duration;
}

/**
 * **The outbox, in `TransportEventBusModule`'s options**: where each namespace's events go, the
 * modules those destinations need, and the settings.
 *
 * A destination is `@nestjs/outbox`'s own `ClientProxyTransport`, around the application's client
 * and with the packet of its transport ({@link OutboxPackets}); it is keyed by the namespace whose
 * events it carries, and that key is the whole routing: an event declared
 * `@EventType({ namespace: 'posts' })` leaves through `destinations.posts`, and an event of a
 * namespace with no destination stays in the process. Two namespaces on one broker are two keys with
 * the same transport.
 *
 * ```ts
 * outbox: {
 *   imports: [PostEventsClientModule],
 *   destinations: PostEventsClient.destinations(appConfig()),
 *   inject: [outboxConfig.KEY],
 *   useFactory: (outbox: OutboxConfig) => outbox,
 * }
 * ```
 */
export interface TransportOutboxOptions {
  /** `namespace → ClientProxyTransport(Client, { toPacket })`. */
  readonly destinations?: Readonly<Record<string, Type<OutboxTransport>>>;
  /** The modules that provide the clients the destinations wrap: `OutboxModule` instantiates them. */
  readonly imports?: ModuleMetadata['imports'];
  readonly inject?: any[];
  readonly useFactory?: (
    ...args: any[]
  ) => TransportOutboxSettings | Promise<TransportOutboxSettings>;
}
