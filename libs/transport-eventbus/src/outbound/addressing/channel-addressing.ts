import { DiscoveryService } from '@nestjs/core';
import type { ClientProxy, Transport } from '@nestjs/microservices';
import type { EventAddress } from '../event-address';

/**
 * Which transport an addressing speaks: one of Nest's, or a symbol for one it does not ship (the
 * in-process transport is `MemoryClient.TRANSPORT`). It names the protocol, never the destination —
 * what a destination takes is the namespaces in its `@Publisher(...)`.
 */
export type TransportId = Transport | symbol;

/**
 * The only thing in this library that knows how a given transport addresses.
 *
 * ## Why it is this small
 * Because the rest is not transport-specific any more. What goes **in** the message is a
 * {@link EventEnvelopeSerializer}, which is Nest's own extension point for exactly that; what is left
 * is the one thing a serializer cannot decide, because `emit` takes it as its first argument: **the
 * pattern**. RabbitMQ calls it a routing key, NATS a subject, Kafka a topic, and each builds it from
 * the event's name and its aggregate differently.
 *
 * ## Why {@link serves}, and what it buys
 * The addressing is chosen **per client**, not per process. One application can publish to a RabbitMQ
 * exchange and a Kafka topic at the same time, which is what choreography asks for: the transport is
 * chosen by each edge, not by the node.
 *
 * ## Why it receives an {@link EventAddress} and not the event
 * Because reading the event is one decision, and it has already been taken. An implementation that
 * received the event would have to re-extract the message type and re-pick the ordering tag; here each
 * one does exclusively what only it can do.
 */
export interface ChannelAddressing {
  /** The transport this implementation serves, for the routing table's log and its errors. */
  readonly transport: TransportId | string;

  /** Whether this addressing is the one for that client — normally an `instanceof`. */
  serves(client: ClientProxy): boolean;

  /**
   * The pattern the event is emitted under: RabbitMQ's routing key, NATS' subject, Redis' channel.
   */
  pattern(address: EventAddress): string;

  /**
   * A catch-all serves any client, and is therefore only consulted after the specific ones. It is how
   * upstream's single-pattern mode is expressed — see {@link SinglePatternAddressing} — and it is
   * opt-in for a reason: an addressing that quietly answered for every transport would put the
   * measured failure back, which is a message going out under a pattern nobody bound to, dropped by
   * the broker without a line in the log.
   */
  readonly catchAll?: boolean;
}

/**
 * Marks a provider as a {@link ChannelAddressing}, so the routing table can collect **all** of them
 * from one injection point. An application that speaks a transport this library does not ship simply
 * declares its own.
 */
export const Addressing = DiscoveryService.createDecorator<void>();
