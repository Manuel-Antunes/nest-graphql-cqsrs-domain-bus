import type { ProcessingContext } from '../unit-of-work/processing-context';
import { ResourceKey } from '../unit-of-work/resource-key';
import type { MessageType } from './message-type';

/**
 * **What is said about a message, beside its payload** — Axon 5's `Metadata`: strings only, and
 * never changed in place. A message with more metadata is another message ({@link Message.andMetadata}).
 *
 * On the wire it is the `headers` of `@nestjs/outbox`'s `OutboxEnvelope`, key for key.
 */
export type Metadata = Readonly<Record<string, string>>;

const attached = new WeakMap<object, Message>();

/**
 * **A payload, with its identity and what is said about it** — Axon 5's `Message`.
 *
 * `@nestjs/cqrs` hands handlers the payload itself — the event or the command instance — and not a
 * message, so the message travels **attached** to its payload: {@link EventMessage.of}(event) answers
 * the message an event was published as, wherever that event instance goes. That is what lets a
 * handler written for `@nestjs/cqrs` stay one, while the bus, the store and the outbox speak messages.
 */
export abstract class Message<P extends object = object> {
  /** Where the message being handled is kept in its context — Axon's `Message.RESOURCE_KEY`. */
  static readonly RESOURCE_KEY = new ResourceKey<Message>('Message');

  protected constructor(
    /** Unique per message, and stable: what every inbox deduplicates by. */
    readonly identifier: string,
    readonly type: MessageType,
    readonly payload: P,
    readonly metadata: Metadata,
  ) {}

  /** The message being handled in `context`, if any. */
  static fromContext(
    context: ProcessingContext | undefined,
  ): Message | undefined {
    return context?.getResource(Message.RESOURCE_KEY);
  }

  /** A branch of `context` in which `message` is the one being handled. */
  static addToContext(
    context: ProcessingContext,
    message: Message,
  ): ProcessingContext {
    return context.withResource(Message.RESOURCE_KEY, message);
  }

  /** The message `payload` is attached to, without making one. */
  static attachedTo(payload: unknown): Message | undefined {
    return typeof payload === 'object' && payload !== null
      ? attached.get(payload)
      : undefined;
  }

  /** The same message with this metadata instead. */
  abstract withMetadata(metadata: Metadata): Message<P>;

  /** The same message with `extra` merged over its metadata — the later key wins. */
  andMetadata(extra: Metadata): Message<P> {
    return this.withMetadata({ ...this.metadata, ...extra });
  }

  /** Makes this the message its payload answers from now on. */
  protected attach(): this {
    attached.set(this.payload, this);
    return this;
  }
}
