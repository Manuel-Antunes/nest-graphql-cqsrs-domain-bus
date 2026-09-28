import { randomUUID } from 'node:crypto';

import type { Metadata } from './message';
import { Message } from './message';
import { MessageType } from './message-type';

/**
 * **A command, as a message** — Axon 5's `CommandMessage`. `CommandBus.execute` makes one for every
 * command it runs, and its identifier is the identifier of the command's unit of work.
 *
 * Its metadata is what the command was dispatched with: what the request it carries declares
 * (`toAttributes()`), stamped with the correlation data of the message whose handler dispatched it —
 * which is how a command a saga sends is caused by the event the saga reacted to.
 */
export class CommandMessage<P extends object = object> extends Message<P> {
  private constructor(
    identifier: string,
    type: MessageType,
    payload: P,
    metadata: Metadata,
  ) {
    super(identifier, type, payload, metadata);
  }

  /** The message `payload` was dispatched as, or a new one with this metadata. */
  static of<P extends object>(
    payload: P,
    metadata: Metadata = {},
  ): CommandMessage<P> {
    const existing = Message.attachedTo(payload);
    return existing instanceof CommandMessage
      ? (existing as CommandMessage<P>)
      : new CommandMessage(
          randomUUID(),
          new MessageType(payload.constructor.name),
          payload,
          metadata,
        ).attach();
  }

  withMetadata(metadata: Metadata): CommandMessage<P> {
    return new CommandMessage(
      this.identifier,
      this.type,
      this.payload,
      metadata,
    ).attach();
  }

  override andMetadata(extra: Metadata): CommandMessage<P> {
    return this.withMetadata({ ...this.metadata, ...extra });
  }
}
