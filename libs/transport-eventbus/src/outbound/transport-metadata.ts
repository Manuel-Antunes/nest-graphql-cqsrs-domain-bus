import { randomUUID } from 'node:crypto';
import type { EventTag } from '@nestposts/platform/domain/shared/event-type';
import type { EnvelopeMetadata, EventEnvelope, WireTag } from './event-envelope';

/**
 * The marks this integration leaves on an event **instance** — what it is called on the wire, and
 * where it came from.
 *
 * ## Why the ORIGIN travels on the message
 * To cut the loop. Every event published locally is offered to the destinations, and every event that
 * arrives from a transport is **published on the local event bus** — which offers it to the
 * destinations again. Without a mark of origin the two rules feed each other: service A publishes, B
 * receives and republishes, A receives and republishes, forever. It is not a theoretical risk, it is
 * what the two rules together do.
 *
 * The mark answers it with a question the message answers by itself: "am I the author of this event?"
 * Whoever is not the author does not forward. Each event then crosses the broker **once**, in the
 * direction of whoever produced it, and the queue topology stops being the only defence — which
 * matters, because a binding is configuration, and configuration changes.
 *
 * ## Why the TAGS travel on the message
 * Because on the other side they are not recoverable. Tags come from the properties `@EventType`
 * declares, and an ingested message is a body and a header map — the class may not even exist there.
 * The tags are what identifies the aggregate the event belongs to, which is what routing and
 * idempotency are built on.
 */
const IDENTIFIER = Symbol.for('nestposts.cqrs-transport.identifier');
const INGESTION = Symbol.for('nestposts.cqrs-transport.ingestion');

/** What an ingested event carries about where it came from. */
export interface Ingestion {
  readonly origin: string | undefined;
  readonly identifier: string;
  readonly messageType: string;
  readonly metadata: EnvelopeMetadata;
  readonly tags: readonly WireTag[];
}

export const wireTagsOf = (tags: readonly EventTag[]): WireTag[] =>
  tags.map((tag) => ({ key: tag.key, value: tag.value }));

/**
 * The identifier of **this event instance**, generated once and remembered on it.
 *
 * Remembering it is the point: a retry that forwards the same instance again sends the same
 * identifier, so the inbox on the other side recognises the redelivery. A command that runs twice
 * raises two events and gets two identifiers, which is also correct — those are two facts.
 */
export const identifierOf = (event: object): string => {
  const carrier = event as Record<symbol, string | undefined>;
  if (!carrier[IDENTIFIER]) {
    Object.defineProperty(event, IDENTIFIER, {
      value: randomUUID(),
      enumerable: false,
      configurable: true,
    });
  }
  return carrier[IDENTIFIER] as string;
};

/**
 * Marks a reconstructed event with where it came from — the answer to "am I the author of this?",
 * and what a projector reads to tell a replica of a local decision.
 */
export const markIngested = (event: object, envelope: EventEnvelope): void => {
  Object.defineProperty(event, INGESTION, {
    value: {
      origin: envelope.origin,
      identifier: envelope.identifier,
      messageType: envelope.messageType,
      metadata: envelope.metadata,
      tags: envelope.tags,
    } satisfies Ingestion,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(event, IDENTIFIER, {
    value: envelope.identifier,
    enumerable: false,
    configurable: true,
  });
};

export const ingestionOf = (event: object): Ingestion | undefined =>
  (event as Record<symbol, Ingestion | undefined>)[INGESTION];

/** The service that produced the event, or `undefined` when this service did. */
export const originOf = (event: object): string | undefined => ingestionOf(event)?.origin;

/**
 * Whether this instance came from outside — and therefore must not be forwarded again.
 *
 * It is this, and not {@link originOf}, that cuts the loop: upstream's wire shape carries no origin,
 * so an event reconstructed from it would have none to read, and the two rules ("everything published
 * locally is forwarded", "everything received is published locally") would feed each other forever.
 */
export const isIngested = (event: object): boolean => ingestionOf(event) !== undefined;
