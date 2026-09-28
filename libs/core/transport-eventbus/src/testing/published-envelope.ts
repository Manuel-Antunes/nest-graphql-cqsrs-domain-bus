import { AsyncContext } from '@nestjs/cqrs';
import type { OutboxEnvelope } from '@nestjs/outbox';

import { DefaultSequencingPolicy } from '../eventhandling/sequencing-policy';
import { AnnotationBasedTagResolver } from '../eventsourcing/tag';
import { EventMessage } from '../messaging/event-message';
import type { Metadata } from '../messaging/message';
import { EventMessages } from '../outbound/event-messages';
import type { RequestContextCodec } from '../request-context';
import { DefaultRequestContextCodec } from '../request-context';
import { TransportIdentity } from '../transport-identity';

/** What a producer's outbox publishes for one event: the routing key a broker emits it under, and the envelope. */
export interface PublishedEnvelope {
  readonly pattern: string;
  readonly envelope: OutboxEnvelope;
}

/**
 * **An event, as another service's outbox would have published it** — built by the same
 * {@link EventMessages} production writes with, so a spec that delivers it to a consumer exercises
 * the real headers, the real routing key and the real payload encoding, with no broker in between.
 *
 * `request` is attached to the event and said in its metadata, as the producer's bus would; `metadata`
 * is anything else the producer's unit of work would have stamped — a `correlationId`, say.
 */
export const publishedEnvelope = (
  event: object,
  options: {
    readonly producer?: string;
    readonly codec?: RequestContextCodec;
    readonly request?: AsyncContext;
    readonly metadata?: Metadata;
    readonly createdAt?: number;
  } = {},
): PublishedEnvelope => {
  options.request?.attachTo(event);
  const codec = options.codec ?? new DefaultRequestContextCodec();
  const message = EventMessage.of(event).andMetadata({
    ...codec.toMetadata(AsyncContext.of(event)),
    ...(options.metadata ?? {}),
  });
  const messages = new EventMessages(
    TransportIdentity.named(options.producer ?? 'producer-spec'),
    new AnnotationBasedTagResolver(),
    new DefaultSequencingPolicy(),
  );
  const outbound = messages.forDestination(
    message,
    new Set([message.type.namespace]),
  );
  if (!outbound) {
    throw new TypeError(
      `${event.constructor.name} does not leave a process: it has no @EventType namespace, or it came from elsewhere`,
    );
  }
  return {
    pattern: messages.addressOf(message).routingKey,
    envelope: {
      id: outbound.id ?? message.identifier,
      topic: outbound.topic,
      key: outbound.key ?? null,
      headers: { ...outbound.headers },
      createdAt: options.createdAt ?? Date.now(),
      payload: outbound.payload,
    },
  };
};
