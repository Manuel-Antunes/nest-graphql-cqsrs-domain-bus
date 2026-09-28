import { Logger } from '@nestjs/common';
import type { OutboxEnvelope } from '@nestjs/outbox';
import {
  eventTypeFor,
  registeredEventTypes,
} from '@nestposts/platform/domain/shared/event-type';

const logger = new Logger('EventReconstruction');

/**
 * **The `OutboxEnvelope` a controller was handed**, checked: `@EventPattern` handlers take it with
 * `@Payload()`, and a payload that is not one is a wiring mistake — a producer that is not an outbox,
 * or a transport whose deserializer changed the shape — refused by name rather than ingested as
 * nothing.
 */
export const envelopeOf = (value: unknown): OutboxEnvelope => {
  const candidate = (
    typeof value === 'string' || Buffer.isBuffer(value)
      ? JSON.parse(value.toString())
      : value
  ) as Partial<OutboxEnvelope> | undefined;
  if (
    typeof candidate?.id !== 'string' ||
    typeof candidate.topic !== 'string' ||
    typeof candidate.headers !== 'object' ||
    candidate.headers === null
  ) {
    throw new TypeError(
      `a transport message that is not an OutboxEnvelope: ${JSON.stringify(value)?.slice(0, 200)}. ` +
        'Every event here is published by @nestjs/outbox, whose ClientProxyTransport sends ' +
        '{ id, topic, key, headers, createdAt, payload } — take it with @Payload().',
    );
  }
  return candidate as OutboxEnvelope;
};

/**
 * **A payload becomes an event again — as an instance of its real class.**
 *
 * ## Why the real class, and not a named anonymous one
 * `@nestjs/cqrs` 12 stamps `{ id: randomUUID() }` on the event class when `@EventsHandler(SomeEvent)`
 * is read, and filters published events by that id off the instance's constructor. A forged class has
 * no id, so **nothing** matches it — not a handler, not a saga, not a GraphQL subscription — and the
 * event is dropped without an error. Finding the class is what the `@EventType` registry is for.
 *
 * ## The instance is built without calling the constructor
 * `Object.create(prototype)` and then the fields. A domain event here is data — its constructor only
 * assigns — and calling it would mean guessing the order of its parameters from a JSON object, which
 * is how a field gets silently assigned to the wrong one.
 */
export const instantiate = (
  messageType: string,
  fields: Record<string, unknown>,
): object => {
  const declared = eventTypeFor(messageType) ?? byLocalName(messageType);
  const event = declared
    ? (Object.create(declared.eventClass.prototype) as object)
    : anonymous(messageType);
  Object.assign(event, fields);
  return event;
};

/** Whether this process knows the class of a message type — whether {@link instantiate} can rebuild it. */
export const isKnownType = (messageType: string): boolean =>
  (eventTypeFor(messageType) ?? byLocalName(messageType)) !== undefined;

const anonymous = (name: string): object => {
  logger.warn(
    `${name} is not declared with @EventType in this service: the event is reconstructed under its ` +
      `name, but no handler, saga or subscription will match it — @nestjs/cqrs matches by an id it ` +
      `stamps on the event CLASS, and this one is not that class.`,
  );
  const unknownEvent = class {};
  Object.defineProperty(unknownEvent, 'name', { value: name });
  return new unknownEvent();
};

const byLocalName = (eventName: string) =>
  registeredEventTypes().find(
    (metadata) =>
      metadata.name === eventName || metadata.eventClass.name === eventName,
  );
