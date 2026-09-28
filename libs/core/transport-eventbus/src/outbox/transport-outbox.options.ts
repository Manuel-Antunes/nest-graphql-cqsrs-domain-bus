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
 * so can have no loop: the command's own promise covers the publish. What a drain could not publish —
 * a broker that refused it, a function frozen or killed between the commit and the publish — stays in
 * the outbox, committed, and the next unit of this service that writes to its outbox drains it with
 * its own: every drain publishes whatever of this service's messages is due, not only what its unit
 * staged. While the service receives nothing that publishes, nothing publishes it. `off` is an API-only instance beside another
 * process that relays.
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
   * **The root `OutboxModule`'s `route`** ({@link OutboxRoute}), the same function. A destination
   * message it routes `local` — its namespace has no transport, as in a service with no broker — is
   * not written: nothing in this process receives it. Without it every destination message is written.
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
 * retry. This library writes to it and never configures it. The streaming processing groups
 * (`processingGroups`) are delivered through the same outbox, on its `local` transport.
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
   * has no transport for is not written.
   */
  readonly destinations: readonly string[];
  readonly inject?: any[];
  readonly useFactory?: (
    ...args: any[]
  ) => TransportOutboxSettings | Promise<TransportOutboxSettings>;
}
