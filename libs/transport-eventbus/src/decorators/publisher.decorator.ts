import { DiscoveryService } from '@nestjs/core';

type EventType = string | symbol;

/** What a destination takes: one namespace, several, or {@link EVERY_NAMESPACE}. */
export type PublishedNamespaces = EventType | readonly EventType[];

/**
 * **Every event, whatever its namespace** — including the ones with no `@EventType`, which have none.
 *
 * It is upstream's mode: one destination, no selection, and the event type inside the payload. A
 * service says it on purpose, because "this bus carries everything" is a decision and not a default —
 * a destination that quietly took every namespace would publish the events a domain is mostly made of.
 */
export const EVERY_NAMESPACE = '*';

/**
 * **A destination: this class holds the client, and takes the namespaces it names.**
 *
 * ```ts
 * @Injectable()
 * @Publisher(POSTS_NAMESPACE)
 * export class PostEventsPublisher implements ITransportPublisherEventBus {
 *   constructor(@Inject(POST_EVENTS_CLIENT) readonly client: ClientProxy) {}
 * }
 * ```
 *
 * ## The namespace is the whole selection, and the event already declares it
 * An event's identity on the wire is `@EventType({ namespace, name, version })` —
 * `posts.PostCreated#2.0.0` — and the namespace in it is what this matches. So the event says **what
 * it is** and the destination says **what it takes**, which is one fact on each side instead of the
 * same fact twice: an event that also had to name its destinations would be a domain event carrying a
 * deployment detail, and two places to change when that detail moves.
 *
 * A new event in a namespace some destination already takes goes out routed already, with nothing
 * added anywhere. An event whose namespace no destination takes stays in the process, which is the
 * right default for the events a domain is mostly made of — and an event with no `@EventType` has no
 * namespace at all, so only an {@link EVERY_NAMESPACE} destination carries it.
 *
 * ## Several namespaces, and several destinations
 * `@Publisher(['posts', 'tags'])` takes both. Two destinations may overlap — a broker and an audit bus
 * — and then the event goes out through both, which is a thing worth being able to say; the routing
 * table logs it, because it is also how one publishes the same fact twice by accident.
 *
 * ## Why it is a marker here, and not the sender
 * Upstream's decorator substitutes the class for one that implements `publish` and does the sending.
 * Here the sending is one path — envelope, routing key, origin mark, request context — and a
 * destination that did its own would be a destination whose messages look different from the rest. A
 * class that still wants upstream's behaviour keeps it: if it implements `publish`, the bus calls it
 * instead.
 */
export const Publisher = DiscoveryService.createDecorator<PublishedNamespaces>();

/** The namespaces a destination declared, or `undefined` when it declared none. */
export const publisherNamespacesOf = (publisher: object): readonly string[] | undefined => {
  const target = typeof publisher === 'function' ? publisher : publisher.constructor;
  const declared = Reflect.getMetadata(Publisher.KEY, target) as PublishedNamespaces | undefined;
  return declared === undefined ? undefined : namespacesIn(declared);
};

/** The declaration as a list, whichever of the two shapes it was written in. */
export const namespacesIn = (declared: PublishedNamespaces): readonly string[] =>
  typeof declared === 'string' ? [declared] : [...(declared as readonly string[])];
