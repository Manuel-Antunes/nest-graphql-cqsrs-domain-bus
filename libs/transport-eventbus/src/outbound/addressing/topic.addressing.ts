import type { Type } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { requireEventTypeOf } from '@nestposts/platform/domain/shared/event-type';
import { TRANSPORT_EVENT_BUS_PATTERN } from '../../constants';
import type { EventAddress } from '../event-address';
import type { ChannelAddressing, TransportId } from './channel-addressing';

/**
 * **The topic pattern, once**: `namespace.localName.orderingKey` — the key a topic exchange selects
 * and orders by, and the one every transport with topic semantics of its own ends up wanting.
 *
 * ## Why a base class and not three copies
 * Because the key is not a property of RabbitMQ: it is what this system decided an event's address
 * looks like, and a transport either speaks it or it does not. {@link RabbitMqAddressing} and
 * {@link MemoryAddressing} therefore differ in exactly one thing — which client they recognise —
 * and that is all either of them says.
 *
 * ## The fallback, and why it is here
 * An event with no `@EventType` has no namespace, so there is no key to build: it goes out under
 * upstream's single pattern, which is the identity such an event has always had. Leaving that to each
 * subclass would be leaving one of them to forget it, and what a forgotten case produces is an
 * `undefined` segment in a routing key nobody bound to.
 */
export abstract class TopicAddressing implements ChannelAddressing {
  abstract readonly transport: TransportId | string;

  abstract serves(client: ClientProxy): boolean;

  pattern(address: EventAddress): string {
    return address.namespace
      ? `${address.qualifiedName}.${address.orderingKey}`
      : TRANSPORT_EVENT_BUS_PATTERN;
  }
}

/** AMQP's wildcards, and the ones {@link topicMatches} understands: one segment, and the rest. */
const ONE_SEGMENT = '*';
const EVERY_SEGMENT = '#';

/**
 * **The binding for everything a consumer wants**, written in the same shape
 * {@link TopicAddressing} publishes under — so what a controller declares and what a producer sends
 * are read from one place.
 *
 * ```ts
 * @EventPattern(everyEventOf(POSTS_NAMESPACE))      // posts.#        — every event of the namespace
 * @EventPattern(everyEventOf(PostCreatedEvent))     // posts.PostCreated.*  — one type, any aggregate
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
 * and the `string` one infers the handler's payload as `{}` — which makes a typed parameter a
 * compile error with a message about property descriptors. Keeping the pattern a literal type is what
 * keeps the controller readable.
 */
export function everyEventOf<TNamespace extends string>(
  namespace: TNamespace,
): `${TNamespace}.${typeof EVERY_SEGMENT}`;
export function everyEventOf(event: Type<object>): `${string}.${typeof ONE_SEGMENT}`;
export function everyEventOf(target: string | Type<object>): string {
  return typeof target === 'string'
    ? `${target}.${EVERY_SEGMENT}`
    : `${requireEventTypeOf(target).qualifiedName}.${ONE_SEGMENT}`;
}
