import { Injectable } from '@nestjs/common';
import { AsyncContext } from '@nestjs/cqrs';
import type { NewOutboxMessage, OutboxMessage } from '@nestjs/outbox';
import { namespaceIn } from '@nestposts/platform/domain/shared/event-type';

import { RequestContextCodec } from '../request-context';
import { EventTrace, injectTraceContext } from '../tracing';
import { TransportIdentity } from '../transport-identity';
import { EventAddress } from './event-address';
import type { MessageHeaders } from './message-headers';
import {
  encodeData,
  encodeTags,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
} from './message-headers';
import { isIngested } from './transport-metadata';

/**
 * **What an event becomes when it leaves: one outbox message, addressed by what the event declares.**
 *
 * The event says where it goes and nothing else does. `@EventType({ namespace })` is its identity on
 * the wire, and the namespace is also its destination: the outbox has one transport per namespace a
 * service publishes (`destinations` in `TransportEventBusModule`'s options), and {@link routeOf} reads
 * the namespace back off the message to pick it. There is no second declaration — no class naming
 * which events go where — to keep in step with the first.
 *
 * | | |
 * |---|---|
 * | `id` | the event's identifier — what every consumer's inbox deduplicates by |
 * | `topic` | the routing key, `namespace.Name.aggregate`, which a consumer binds to |
 * | `key` | the aggregate, within the namespace: one aggregate's events are published one at a time, in commit order |
 * | `payload` | the event's fields, encoded once for JSON — a `Date` comes back a `Date` |
 * | `headers` | what is said about it: its type, who produced it, its tags, the request it belongs to and the trace it was raised in, captured now — the relay publishes later, in no request at all |
 *
 * An event stays in the process when this service does not publish, when it came from another one
 * (the origin mark: publishing it again would be the loop the mark exists to cut), or when no
 * destination takes its namespace — which is the right default for most of a domain's events.
 */
@Injectable()
export class EventMessages {
  constructor(
    private readonly identity: TransportIdentity,
    private readonly context: RequestContextCodec,
  ) {}

  /** The message `event` becomes, or `undefined` when it stays in this process. */
  of(
    event: object,
    destinations: ReadonlySet<string>,
  ): NewOutboxMessage | undefined {
    if (!this.identity.publishes || isIngested(event)) {
      return undefined;
    }
    const address = EventAddress.of(event);
    if (!destinations.has(address.namespace)) {
      return undefined;
    }
    return {
      id: address.identifier,
      topic: address.routingKey,
      key:
        address.orderingKey === EventAddress.NO_AGGREGATE
          ? null
          : `${address.namespace}/${address.orderingKey}`,
      payload: encodeData(event),
      headers: this.headersOf(event, address),
    };
  }

  /**
   * The trace is written **last**, and the order is the point: a service in the middle of a chain
   * hands back what arrived ({@link TransportRequestContext.toAttributes}), and anything of the
   * previous hop's that slipped through is overwritten here by the trace this service is in now.
   * It is the trace the event was **published** in ({@link EventTrace}), and the active one only
   * for an event nobody stamped.
   */
  private headersOf(event: object, address: EventAddress): MessageHeaders {
    const timestamp = (event as { occurredAt?: Date }).occurredAt ?? new Date();
    return {
      [TRANSPORT_MESSAGE_TYPE]: address.messageType,
      [TRANSPORT_TIMESTAMP]: timestamp.toISOString(),
      [TRANSPORT_ORIGIN]: this.identity.applicationName,
      [TRANSPORT_TAGS]: encodeTags(address.tags),
      ...this.context.encode(AsyncContext.of(event), event),
      ...(EventTrace.carrierOf(event) ?? injectTraceContext({})),
    };
  }
}

/**
 * **The outbox's `route`: a message goes through the transport named after its namespace** — read off
 * the message type the event declared, so the decision is the event's own.
 */
export const routeOf = (message: OutboxMessage): string =>
  namespaceIn(
    (message.headers as MessageHeaders)[TRANSPORT_MESSAGE_TYPE] ?? '',
  );
