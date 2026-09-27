import type { OutboxMessage } from '@nestjs/outbox';
import { namespaceIn } from '@nestposts/platform/domain/shared/event-type';

import type { MessageHeaders } from './message-headers';
import { TRANSPORT_MESSAGE_TYPE } from './message-headers';

/**
 * What the outbox's `route` is: the name of the transport a message goes through. It reads the
 * headers alone, so the bus can ask it about a message before the outbox holds one.
 */
export type OutboxRouteFunction = (
  message: Pick<OutboxMessage, 'headers'>,
) => string;

/**
 * **The outbox's `route`: a message goes through the transport named after its namespace — and, when
 * the outbox has none for it, to `local`, the outbox's own in-process transport.**
 *
 * The namespace is read off the message type the event declared, so the decision is the event's own.
 * `local` is what the relay itself falls back to when it has no transport at all; saying it here is
 * what makes it hold per namespace, for an outbox with a transport for some of what the service
 * publishes and not for the rest — and what keeps a namespace with no transport from being
 * dead-lettered as a transport nobody registered.
 *
 * `local` delivers to the `@OnOutboxMessage()` handlers of this process, by exact topic. One of them
 * is always there: `TransportEventBusModule` registers {@link LocalDelivery} for every event of the
 * namespaces the service publishes, and it is what tells this process's `EventBus` about an event
 * routed `local` — once its unit of work has committed, through the relay, and not at the commit.
 * For that the bus is given the **same** route, so it knows which events not to tell at the commit:
 *
 * ```ts
 * OutboxModule.forRootAsync({
 *   imports: [PostEventsClientModule],
 *   transports: PostEventsClient.destinations(appConfig()),
 *   inject: [appConfig.KEY],
 *   useFactory: (app: AppConfig) => ({ route: PostEventsClient.route(app) }),
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
export class OutboxRoute {
  /** `@nestjs/outbox`'s name for its in-process transport, which the package does not export. */
  static readonly LOCAL = 'local';

  /** The route over the transports the root `OutboxModule` was given — the same record, by name. */
  static over(
    transports: Readonly<Record<string, unknown>>,
  ): OutboxRouteFunction {
    const names = new Set(Object.keys(transports));
    return (message) => {
      const namespace = OutboxRoute.namespaceOf(message);
      return names.has(namespace) ? namespace : OutboxRoute.LOCAL;
    };
  }

  /** The namespace the message's type declares: the name of the transport it leaves through. */
  static namespaceOf(message: Pick<OutboxMessage, 'headers'>): string {
    return namespaceIn(
      (message.headers as MessageHeaders)[TRANSPORT_MESSAGE_TYPE] ?? '',
    );
  }
}
