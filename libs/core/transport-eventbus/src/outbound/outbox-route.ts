import type { OutboxMessage } from '@nestjs/outbox';
import { namespaceIn } from '@nestposts/platform/domain/shared/event-type';

import type { MessageHeaders } from './message-headers';
import {
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_PROCESSING_GROUP,
} from './message-headers';

/**
 * What the outbox's `route` is: the name of the transport a message goes through. It reads the
 * headers alone, so the bus can ask it about a message before the outbox holds one.
 */
export type OutboxRouteFunction = (
  message: Pick<OutboxMessage, 'headers'>,
) => string;

/**
 * **The outbox's `route`: a message for a streaming processing group goes to `local`, and any other
 * through the transport named after its namespace — or to `local` when the outbox has none for it.**
 *
 * `local` is the outbox's own in-process transport: it delivers to this process's
 * `@OnOutboxMessage()` handlers by exact topic, and every streaming group has one
 * (`StreamingGroupDelivery`), bound to the group's topic. A destination message the outbox has no
 * transport for — a service running with no broker — is not written at all: the bus is given the same
 * route, and does not stage a message that would only reach `local` and find nobody there.
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
      if ((message.headers as MessageHeaders)[TRANSPORT_PROCESSING_GROUP]) {
        return OutboxRoute.LOCAL;
      }
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
