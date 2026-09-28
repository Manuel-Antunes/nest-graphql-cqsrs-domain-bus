import type { Type } from '@nestjs/common';
import type { OutboxMessage } from '@nestjs/outbox';
import { requireEventTypeOf } from '@nestposts/platform/domain/shared/event-type';

import {
  DefaultSequencingPolicy,
  SequentialPolicy,
} from '../eventhandling/sequencing-policy';
import type { Tag } from '../eventsourcing/tag';
import { AnnotationBasedTagResolver } from '../eventsourcing/tag';
import { EventMessage } from '../messaging/event-message';
import { MessageType } from '../messaging/message-type';
import type { MessageHeaders, WireTag } from './message-headers';
import {
  decodeTags,
  TRANSPORT_EVENT_ID,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_TAGS,
} from './message-headers';

/**
 * **Where this event goes, read from the event itself.** Not one field here comes from configuration.
 *
 * ## Why there is a value in the middle
 * Because "which event is this" is asked by four different things — the outbox's route (by
 * {@link namespace}), its topic (by {@link qualifiedName}), the wire (by {@link messageType}) and the
 * broker (by {@link routingKey}) — and reading the event once is what keeps them from disagreeing. A
 * decision taken twice is how two implementations come to answer differently about the same event.
 * The relay, which publishes a message and not an event, reads the same address back off it
 * ({@link ofMessage}).
 */
export class EventAddress {
  private static readonly tagResolver = new AnnotationBasedTagResolver();
  private static readonly sequencing = new DefaultSequencingPolicy();

  /**
   * What becomes the ordering key of an event with no tag at all. It should not happen — an event
   * that does not say which aggregate it belongs to cannot be routed to a consumer that cares about
   * that aggregate — and the sentinel exists so the key keeps the same number of segments, because
   * that is what the bindings depend on.
   */
  static readonly NO_AGGREGATE = SequentialPolicy.SEQUENCE;

  /** AMQP's wildcards, and the ones {@link topicMatches} understands: one segment, and the rest. */
  private static readonly ONE_SEGMENT = '*';
  private static readonly EVERY_SEGMENT = '#';

  constructor(
    /** `namespace.Name#version`, the way the envelope carries it. */
    readonly messageType: string,
    /**
     * `namespace.Name` — what `@EventType` declares, and the outbox message's `topic`: what
     * `@OnOutboxMessage()` is declared with, because the outbox's `local` transport matches a handler
     * by its exact topic. Without the namespace in the value, a binding on `posts.*` does not match
     * and the exchange drops the message without a line in the log.
     */
    readonly qualifiedName: string,
    /** The namespace on its own: it is by this that the outbox picks the destination ({@link OutboxRoute}). */
    readonly namespace: string,
    readonly identifier: string,
    /** The sequence the event was published in — its {@link SequencingPolicy}'s answer. */
    readonly orderingKey: string,
    readonly tags: readonly WireTag[],
  ) {}

  /**
   * **The pattern a broker's binding is matched against** — RabbitMQ's routing key, SNS's
   * `routingKey` attribute, and what a `TopicMemoryServer` matches its bindings against. It is not the
   * outbox's topic, which names the event and not the instance ({@link qualifiedName}): each
   * transport's packet reads it off the message it publishes ({@link OutboxPackets}).
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
   * ## A transport that addresses differently
   * Does it in its own `toPacket` ({@link OutboxPackets}), which receives the message and answers the
   * pattern the transporter sends under — Inngest's qualified name, a Kafka topic. That is the one
   * place that already knows the protocol, and it is why this is a property and not an abstraction.
   */
  get routingKey(): string {
    return `${this.qualifiedName}.${this.orderingKey}`;
  }

  /**
   * **The address of a message this service publishes** — its type, its identifier, its tags, and
   * the sequence its {@link SequencingPolicy} put it in, which is the routing key's last segment.
   *
   * Given a bare event, it reads the message the event is attached to, the tags `@EventType` declares
   * and the default policy's sequence — what a suite that builds an envelope by hand wants.
   *
   * ## An event with no `@EventType`
   * Gets its class name as its type, no namespace and no version. It has no namespace for a
   * destination to take, and therefore stays in the process, which is the right default for the
   * events most of a domain is made of.
   */
  static of(
    event: EventMessage | object,
    tags?: readonly Tag[],
    sequence?: string,
  ): EventAddress {
    const message =
      event instanceof EventMessage ? event : EventMessage.of(event);
    const resolved = tags ?? EventAddress.tagResolver.resolve(message);
    return new EventAddress(
      message.type.toString(),
      message.type.qualifiedName,
      message.type.namespace,
      message.identifier,
      sequence ??
        EventAddress.sequencing.sequenceIdentifierFor(message, resolved) ??
        EventAddress.NO_AGGREGATE,
      resolved.map((tag) => ({ key: tag.key, value: tag.value })),
    );
  }

  /**
   * **The same address, read back off a message the outbox holds** — what a transport's packet has
   * in hand, because the relay publishes a message and not an event. The sequence is the message's
   * `key` after its namespace, and, for a message with no key, its first tag.
   */
  static ofMessage(
    message: Pick<OutboxMessage, 'id' | 'topic' | 'headers'> & {
      readonly key?: string | null;
    },
  ): EventAddress {
    const headers = message.headers as MessageHeaders;
    const type = MessageType.parse(
      headers[TRANSPORT_MESSAGE_TYPE] ?? message.topic,
    );
    const tags = decodeTags(headers[TRANSPORT_TAGS]);
    const prefix = `${type.namespace}/`;
    return new EventAddress(
      type.toString(),
      type.qualifiedName,
      type.namespace,
      headers[TRANSPORT_EVENT_ID] ?? message.id,
      message.key?.startsWith(prefix)
        ? message.key.slice(prefix.length)
        : (tags[0]?.value ?? EventAddress.NO_AGGREGATE),
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
}
