import { randomUUID } from 'node:crypto';

import type { Metadata } from './message';
import { Message } from './message';
import { MessageType } from './message-type';

/** What an event message is made with, when it is not made from scratch. */
export interface EventMessageInit {
  readonly identifier?: string;
  readonly type?: MessageType;
  readonly metadata?: Metadata;
  readonly timestamp?: Date;
}

/**
 * **An event, as a message** — Axon 5's `EventMessage`: an identifier, a {@link MessageType}, the
 * payload, its metadata and the instant it happened. It carries no aggregate and no sequence: which
 * entities an event is about are its **tags** (`@EventType({ tags })`), and its place in a stream is
 * the event store's business.
 *
 * ```ts
 * const message = EventMessage.of(event);   // the one the event was published as
 * message.identifier;                        // what every inbox keys by
 * message.metadata.correlationId;            // the request it belongs to
 * ```
 */
export class EventMessage<P extends object = object> extends Message<P> {
  private constructor(
    identifier: string,
    type: MessageType,
    payload: P,
    metadata: Metadata,
    readonly timestamp: Date,
  ) {
    super(identifier, type, payload, metadata);
  }

  /**
   * The message `payload` was published as — or, for a payload nobody published yet, a new one: a
   * fresh identifier, the type it declares, no metadata, and its `occurredAt` as the instant. The
   * answer is remembered, so the same instance is always the same message.
   */
  static of<P extends object>(payload: P): EventMessage<P> {
    const existing = Message.attachedTo(payload);
    return existing instanceof EventMessage
      ? (existing as EventMessage<P>)
      : EventMessage.create(payload);
  }

  /** A message for `payload` built from what is already known about it — what arrived on the wire, or a row of the store. */
  static create<P extends object>(
    payload: P,
    init: EventMessageInit = {},
  ): EventMessage<P> {
    return new EventMessage(
      init.identifier ?? randomUUID(),
      init.type ?? MessageType.of(payload),
      payload,
      init.metadata ?? {},
      init.timestamp ?? occurredAtOf(payload) ?? new Date(),
    ).attach();
  }

  /** The event message `payload` is attached to, without making one. */
  static override attachedTo<P extends object>(
    payload: P,
  ): EventMessage<P> | undefined {
    const existing = Message.attachedTo(payload);
    return existing instanceof EventMessage
      ? (existing as EventMessage<P>)
      : undefined;
  }

  withMetadata(metadata: Metadata): EventMessage<P> {
    return new EventMessage(
      this.identifier,
      this.type,
      this.payload,
      metadata,
      this.timestamp,
    ).attach();
  }

  override andMetadata(extra: Metadata): EventMessage<P> {
    return this.withMetadata({ ...this.metadata, ...extra });
  }
}

const occurredAtOf = (payload: object): Date | undefined => {
  const occurredAt = (payload as { occurredAt?: unknown }).occurredAt;
  return occurredAt instanceof Date ? occurredAt : undefined;
};
