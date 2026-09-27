import type { AsyncContext } from '@nestjs/cqrs';
import type { OutboxEnvelope } from '@nestjs/outbox';

import { EventAddress } from '../outbound/event-address';
import { EventMessages } from '../outbound/event-messages';
import type { RequestContextCodec } from '../request-context';
import { CorrelatedRequestContext } from '../request-context';
import { TransportIdentity } from '../transport-identity';

/** What a producer's outbox publishes for one event: the routing key a broker emits it under, and the envelope. */
export interface PublishedEnvelope {
  readonly pattern: string;
  readonly envelope: OutboxEnvelope;
}

/**
 * **An event, as another service's outbox would have published it** — built by the same
 * {@link EventMessages} production stages with, so a spec that delivers it to a consumer exercises
 * the real headers, the real routing key and the real payload encoding, with no broker in between.
 */
export const publishedEnvelope = (
  event: object,
  options: {
    readonly producer?: string;
    readonly codec?: RequestContextCodec;
    readonly request?: AsyncContext;
    readonly createdAt?: number;
  } = {},
): PublishedEnvelope => {
  options.request?.attachTo(event);
  const address = EventAddress.of(event);
  const message = new EventMessages(
    TransportIdentity.named(options.producer ?? 'producer-spec'),
    options.codec ?? new CorrelatedRequestContext(),
  ).of(event, new Set([address.namespace]));
  if (!message) {
    throw new TypeError(
      `${event.constructor.name} does not leave a process: it has no @EventType namespace, or it came from elsewhere`,
    );
  }
  return {
    pattern: address.routingKey,
    envelope: {
      id: message.id ?? address.identifier,
      topic: message.topic,
      key: message.key ?? null,
      headers: { ...message.headers },
      createdAt: options.createdAt ?? Date.now(),
      payload: message.payload,
    },
  };
};
