import { Logger } from '@nestjs/common';
import {
  eventTagsOf,
  eventTypeOf,
  namespaceIn,
  qualifiedNameIn,
} from '@nestposts/platform/domain/shared/event-type';
import type { WireTag } from './event-envelope';
import { identifierOf, wireTagsOf } from './transport-metadata';

/**
 * **Where this event goes, read from the event itself.** Not one field here comes from configuration.
 *
 * ## Why there is a value in the middle
 * Because "which event is this" and "how does this broker address it" are different questions, and
 * they would otherwise sit on the same line: an addressing that read the event would have to
 * re-extract the message type and re-pick the ordering tag — and a decision taken twice is how two
 * implementations come to disagree. Here the event is read **once**: whoever routes ({@link
 * OutboxRouting}) compares {@link namespace} with what each destination takes; whoever addresses
 * ({@link ChannelAddressing}) receives this ready-made and only translates it for its own transport.
 */
export class EventAddress {
  private static readonly logger = new Logger(EventAddress.name);

  /**
   * What becomes the ordering key of an event with no tag at all. It should not happen — an event
   * that does not say which aggregate it belongs to cannot be routed to a consumer that cares about
   * that aggregate — and the sentinel exists so the key keeps the same number of segments, because
   * that is what the bindings depend on.
   */
  static readonly NO_AGGREGATE = 'none';

  constructor(
    /** `namespace.Name#version`, the way the envelope carries it. */
    readonly messageType: string,
    /**
     * `namespace.Name` — what `@EventType` declares. Without the namespace in the value, a binding
     * on `posts.*` does not match and the exchange drops the message without a line in the log.
     */
    readonly qualifiedName: string,
    /** The namespace on its own: it is by this that {@link OutboxRouting} picks the outbox. */
    readonly namespace: string,
    readonly identifier: string,
    /** The identity of the instance — see {@link orderingKeyOf}. */
    readonly orderingKey: string,
    readonly tags: readonly WireTag[],
  ) {}

  /**
   * Reads the address off the event.
   *
   * ## An event with no `@EventType`
   * Gets the identity upstream gives it: **its class name**, no namespace and no version. That is not
   * a degraded mode, it is upstream's mode — `{ payload, eventName }` carries exactly that — and
   * keeping it is what lets an application that declares nothing but an `EVERY_NAMESPACE` destination
   * publish and receive as it always did.
   *
   * What it does not get is a routing key: with no namespace there is nothing to build one from, so
   * {@link ChannelAddressing} falls back to the single pattern — which is the pattern upstream's
   * consumers bind to anyway. An internal event — no `@EventType` — has no namespace for a destination
   * to take either, and therefore stays in the process, which is the right default for the events most
   * of a domain is made of.
   */
  static of(event: object): EventAddress {
    const metadata = eventTypeOf(event);
    const tags = wireTagsOf(eventTagsOf(event));
    const messageType = metadata?.messageType ?? event.constructor.name;
    return new EventAddress(
      messageType,
      metadata?.qualifiedName ?? event.constructor.name,
      metadata?.namespace ?? '',
      identifierOf(event),
      EventAddress.orderingKeyOf(messageType, tags),
      tags,
    );
  }

  static fromMessageType(
    messageType: string,
    identifier: string,
    tags: readonly WireTag[],
  ): EventAddress {
    return new EventAddress(
      messageType,
      qualifiedNameIn(messageType),
      namespaceIn(messageType),
      identifier,
      EventAddress.orderingKeyOf(messageType, tags),
      tags,
    );
  }

  /**
   * **The event's tag — and not a hand-written list of preferences.**
   *
   * An event in this system has exactly one tag, and it is the identity of the aggregate it belongs
   * to. A second tag would mean an event that belongs to two aggregates, which is not something the
   * ordering key can express: whichever one it picked, messages about the same aggregate could land
   * on different consumers. The warning makes that choice visible instead of silent — the tags arrive
   * sorted, so it is stable, just not *informed*.
   */
  private static orderingKeyOf(messageType: string, tags: readonly WireTag[]): string {
    if (tags.length === 0) {
      return EventAddress.NO_AGGREGATE;
    }
    if (tags.length > 1) {
      EventAddress.logger.warn(
        `${messageType} has ${tags.length} tags (${tags
          .map((tag) => tag.key)
          .join(', ')}) — the ordering key will be '${tags[0].key}', the first in order. Two tags ` +
          `mean two aggregates, and a message can only be ordered by one: check the @EventType.`,
      );
    }
    return tags[0].value;
  }
}
