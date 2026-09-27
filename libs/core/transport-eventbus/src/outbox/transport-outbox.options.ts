import type { OutboxRouteFunction } from '../outbound/outbox-route';

/**
 * **How this process takes part in publishing what its units of work staged.**
 *
 * | | the relay | after a unit of work commits |
 * |---|---|---|
 * | `poll` | polls in this process | wakes it (`notify()`) |
 * | `drain` | never polls | publishes what is due before the unit answers |
 * | `off` | never polls | nothing: another process relays |
 *
 * `poll` is a long-lived process. `drain` is a function, which is frozen the moment it answers and
 * so can have no loop: the command's own promise covers the publish, and whatever a failure leaves
 * behind is published by the next unit or by a scheduled sweep. `off` is an API-only instance beside
 * relay workers.
 *
 * Whether the relay polls is `@nestjs/outbox`'s own `relay.enabled`, declared with the rest of the
 * outbox at the application's root: `poll` is `enabled: true`, the other two `false`.
 */
export type OutboxRelayMode = 'poll' | 'drain' | 'off';

/** What an application decides about its outbound half. Every field has a default. */
export interface TransportOutboxSettings {
  /** See {@link OutboxRelayMode}. Default `poll`. */
  readonly relay?: OutboxRelayMode;
  /**
   * The root `OutboxModule`'s `relay.batchSize`, when it is not the default: a drain publishes
   * batches until one comes back short. Default `100`, the package's.
   */
  readonly batchSize?: number;
  /**
   * **The root `OutboxModule`'s `route`** ({@link OutboxRoute}), the same function. An event it
   * routes `local` is told to this process's `EventBus` by the outbox — {@link LocalDelivery}, once
   * the relay delivers it — and **not** at its unit of work's commit, which is where every other
   * event is told. Without it every event is told at the commit, and a message that still goes
   * `local` is only acknowledged there.
   */
  readonly route?: OutboxRouteFunction;
}

/**
 * **The outbound half, in `TransportEventBusModule`'s options**: which namespaces leave the process,
 * and how the process relays them.
 *
 * The outbox itself is `@nestjs/outbox`'s, declared once at the application's root and global: its
 * `transports` — one `ClientProxyTransport` per namespace, around the application's client and with
 * the packet of its transport ({@link OutboxPackets}) — its `route` ({@link OutboxRoute}), relay and
 * retry. This library writes to it and never configures it. A namespace listed here with no
 * transport in the outbox — every one of them, for a service running with no broker — is routed to
 * the outbox's `local` transport, and told to this process's `EventBus` there ({@link LocalDelivery})
 * instead of at the commit, which the settings' `route` is what tells the bus.
 *
 * ```ts
 * OutboxModule.forRootAsync({
 *   imports: [PostEventsClientModule],
 *   transports: PostEventsClient.destinations(appConfig()),
 *   inject: [appConfig.KEY, outboxConfig.KEY],
 *   useFactory: (app: AppConfig, { relay, pollInterval, retry }: OutboxConfig) => ({
 *     route: PostEventsClient.route(app),
 *     relay: { enabled: relay === 'poll', pollInterval },
 *     retry,
 *   }),
 * }),
 * TransportEventBusModule.forRootAsync({
 *   …,
 *   outbox: {
 *     destinations: PostEventsClient.namespaces,
 *     inject: [appConfig.KEY, outboxConfig.KEY],
 *     useFactory: (app: AppConfig, { relay }: OutboxConfig) => ({ relay, route: PostEventsClient.route(app) }),
 *   },
 * }),
 * ```
 */
export interface TransportOutboxOptions {
  /**
   * The namespaces this service publishes — the keys of the root `OutboxModule`'s `transports`, when
   * it has a broker. An event declared `@EventType({ namespace: 'posts' })` is written to the outbox
   * when `'posts'` is here, and an event of any other namespace stays in the process. One the outbox
   * has no transport for goes `local`.
   */
  readonly destinations: readonly string[];
  readonly inject?: any[];
  readonly useFactory?: (
    ...args: any[]
  ) => TransportOutboxSettings | Promise<TransportOutboxSettings>;
}
