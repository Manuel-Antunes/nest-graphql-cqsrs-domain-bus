import type { EventTag } from '@nestposts/platform/domain/shared/event-type';

import { EventMessage } from '../messaging/event-message';
import type { WireTag } from './message-headers';

/**
 * **Where an event came from, remembered on the instance.**
 *
 * Every event published locally may be written to the outbox, and every event a transport delivers
 * is published locally — so without a mark of origin the two rules would feed each other: service A
 * publishes, B receives and republishes, A receives and republishes, forever. The mark answers it
 * with a question the event answers by itself: "did this come from somewhere else?" What did is never
 * written to the outbox for a destination again, and each event crosses the broker once, in the
 * direction of whoever produced it.
 */
export interface Ingestion {
  /** The service that produced the event; `undefined` when it was read back from this service's own store. */
  readonly origin: string | undefined;
}

const ingestions = new WeakMap<object, Ingestion>();

export const wireTagsOf = (tags: readonly EventTag[]): WireTag[] =>
  tags.map((tag) => ({ key: tag.key, value: tag.value }));

/** The identifier of this event instance — its {@link EventMessage}'s, made once and remembered. */
export const identifierOf = (event: object): string =>
  EventMessage.of(event).identifier;

/** Marks an event rebuilt from elsewhere — a transport's delivery, or a row of the store. */
export const markIngested = (event: object, origin?: string): void => {
  ingestions.set(event, { origin });
};

export const ingestionOf = (event: object): Ingestion | undefined =>
  ingestions.get(event);

/** The service that produced the event, or `undefined` when this service did. */
export const originOf = (event: object): string | undefined =>
  ingestionOf(event)?.origin;

/** Whether this instance came from outside — and therefore must not be written for a destination again. */
export const isIngested = (event: object): boolean => ingestions.has(event);
