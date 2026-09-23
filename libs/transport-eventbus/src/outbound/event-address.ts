import type { Type } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import {
  eventTagsOf,
  eventTypeOf,
  namespaceIn,
  qualifiedNameIn,
  requireEventTypeOf,
} from '@nestposts/platform/domain/shared/event-type';

import { TRANSPORT_EVENT_BUS_PATTERN } from '../constants';
import type { WireTag } from './event-envelope';
import { identifierOf, wireTagsOf } from './transport-metadata';

/**
 * **Where this event goes, read from the event itself.** Not one field here comes from configuration.
 *
 * ## Why there is a value in the middle
 * Because "which event is this" is asked by three different things — the routing table (by
 * {@link namespace}), the wire (by {@link messageType}) and the broker (by {@link routingKey}) — and
 * reading the event once is what keeps them from disagreeing. A decision taken twice is how two
 * implementations come to answer differently about the same event.
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

  /** AMQP's wildcards, and the ones {@link topicMatches} understands: one segment, and the rest. */
  private static readonly ONE_SEGMENT = '*';
  private static readonly EVERY_SEGMENT = '#';

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
   * What it does not get is a routing key of its own: with no namespace there is nothing to build one
   * from, so {@link routingKey} answers the single pattern — which is the pattern upstream's consumers
   * bind to anyway. An internal event — no `@EventType` — has no namespace for a destination to take
   * either, and therefore stays in the process, which is the right default for the events most of a
   * domain is made of.
   */
  /**
   * **The pattern the event is emitted under** — RabbitMQ's routing key, and what
   * {@link MemoryClient} matches a binding against.
   *
   * ## Three segments: `namespace.localName.orderingKey`
   * Because a topic exchange's routing key serves two things that pull against each other:
   * **selection** (who binds to what) and **ordering** (what lands on the same consumer). With the
   * first two segments coming from the message type, a consumer binds to `posts.PostCreated.*` and
   * receives only what it asked for. With the third coming from the aggregate's tag, the whole key
   * identifies the instance — and a consistent-hash exchange in front distributes by it, preserving
   * per-aggregate order. **Honest limit:** on a plain topic exchange that order only holds with one
   * consumer per queue; the third segment is what makes the alternative possible, not what already
   * guarantees it.
   *
   * It is the *qualified* name and never the local one: without the namespace in the value a binding
   * on `posts.*` does not match — the message goes out, the exchange drops it, and NOTHING in the log
   * says so. And there is no `switch` over event types, which is the point: a new event in the domain
   * goes out routed already, because the key is derived from metadata the event already carries.
   *
   * ## An event with no `@EventType`
   * Has no namespace, so there is no key to build: it goes out under upstream's single pattern, which
   * is the identity such an event has always had.
   *
   * ## A transport that addresses differently
   * Does it in its own {@link EventEnvelopeSerializer}, which receives the packet and returns what the
   * transporter sends — a Kafka topic, a NATS subject. That is the one place that already knows the
   * protocol, and it is why this is a property and not an abstraction.
   */
  get routingKey(): string {
    return this.namespace
      ? `${this.qualifiedName}.${this.orderingKey}`
      : TRANSPORT_EVENT_BUS_PATTERN;
  }

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

  /**
   * **The binding for everything a consumer wants**, in the same shape {@link routingKey} publishes
   * under — so what a controller declares and what a producer sends are read from one place, and a
   * namespace renamed in `@EventType` takes its bindings with it.
   *
   * ```ts
   * @EventPattern(EventAddress.everyEventOf(POSTS_NAMESPACE))   // posts.#  — every event of the namespace
   * @EventPattern(EventAddress.everyEventOf(PostCreatedEvent))  // posts.PostCreated.*  — one type, any aggregate
   * ```
   *
   * ## Why a whole namespace is a shape worth having
   * Because a service that replicates another's aggregate wants **all** of it: a decision taken against
   * half a history is a wrong decision, and a binding per event type is a list that has to grow every
   * time the other service adds one — silently, since nothing fails when an event nobody bound to is
   * dropped by the exchange. One entry per namespace is also one handler: the message type in the
   * envelope is what resolves the concrete class, so the controller does not need one method per event.
   *
   * The cost, and it is the reason this is a choice rather than the default: the queue then receives
   * events this service does not act on — including its own, which the origin mark drops before the
   * inbox. A consumer that wants one type asks for that type.
   *
   * ## Why the return type is a template literal
   * Because `@EventPattern` resolves to a different overload for a plain `string` than for a literal,
   * and the `string` one infers the handler's payload as `{}` — which makes a typed parameter a compile
   * error with a message about property descriptors. Keeping the pattern a literal type is what keeps
   * the controller readable.
   */
  static everyEventOf<TNamespace extends string>(
    namespace: TNamespace,
  ): `${TNamespace}.${typeof EventAddress.EVERY_SEGMENT}`;
  static everyEventOf(
    event: Type<object>,
  ): `${string}.${typeof EventAddress.ONE_SEGMENT}`;
  static everyEventOf(target: string | Type<object>): string {
    return typeof target === 'string'
      ? `${target}.${EventAddress.EVERY_SEGMENT}`
      : `${requireEventTypeOf(target).qualifiedName}.${EventAddress.ONE_SEGMENT}`;
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
  private static orderingKeyOf(
    messageType: string,
    tags: readonly WireTag[],
  ): string {
    if (tags.length === 0) {
      return EventAddress.NO_AGGREGATE;
    }
    if (tags.length > 1) {
      EventAddress.logger.warn(
        `${messageType} has ${tags.length} tags (${tags
          .map((tag) => tag.key)
          .join(
            ', ',
          )}) — the ordering key will be '${tags[0].key}', the first in order. Two tags ` +
          `mean two aggregates, and a message can only be ordered by one: check the @EventType.`,
      );
    }
    return tags[0].value;
  }
}
