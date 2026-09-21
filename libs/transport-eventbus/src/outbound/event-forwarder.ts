import { Injectable, Logger } from '@nestjs/common';
import { EMPTY, type Observable, from, map, mergeMap, tap } from 'rxjs';
import { EventAddress } from './event-address';
import { EventEnvelopeFactory } from './event-envelope.factory';
import { OutboxRouting } from './outbox-routing';
import { TransportIdentity } from '../transport-identity';
import { identifierOf, isIngested, originOf } from './transport-metadata';

/**
 * Hands an event to the destinations that named it — and nothing else.
 *
 * ## What this class is NOT any more
 * It does not build the message. That is the transporter's serializer
 * ({@link EventEnvelopeSerializer}), declared on each client's options, which is where
 * `@nestjs/microservices` asks for it: `client.emit(pattern, event)` goes out with the event, and the
 * transporter serializes. So there is no envelope, no base64 and no metadata in this file — a new
 * transport changes none of it.
 *
 * ## Generic over every event
 * No event type is named here either. A new event in the domain crosses already, as soon as it says
 * where it goes.
 */
@Injectable()
export class EventForwarder {
  private readonly logger = new Logger(EventForwarder.name);

  constructor(
    private readonly routing: OutboxRouting,
    private readonly identity: TransportIdentity,
    private readonly envelopes: EventEnvelopeFactory,
  ) {}

  /**
   * The event on its way out, as a stream of one value per destination that took it.
   *
   * ## The one line that keeps an infinite loop from existing
   * Everything published on the transport bus is offered to the destinations, and everything received
   * from a transport is published on the local bus. Publish the received one on the *transport* bus
   * and the two rules feed each other: A publishes, B receives and republishes, A receives and
   * republishes, endlessly. An ingested event carries the mark the deserializer left on it, and it is
   * that presence which answers "I am not the author" without consulting anything.
   *
   * Upstream cuts the same loop differently — it deletes the transport flags from the instance before
   * sending, so the rebuilt event has none. That worked because the flags were instance fields; here
   * the event declares nothing about transports at all (see `NOTICE.md`), and its namespace is as true
   * on the far side as it is here. Hence the mark.
   */
  forward(event: object): Observable<void> {
    if (!this.identity.publishes) {
      return EMPTY;
    }
    if (isIngested(event)) {
      this.logger.debug(
        `${event.constructor.name} (${identifierOf(event)}) NOT forwarded: it came from ` +
          `'${originOf(event) ?? 'another service'}'`,
      );
      return EMPTY;
    }

    const address = EventAddress.of(event);
    const routes = this.routing.routesFor(address);
    if (routes.length === 0) {
      this.logger.debug(
        `no destination takes '${address.namespace || 'an event with no namespace'}': ` +
          `${event.constructor.name} stays in this process`,
      );
      return EMPTY;
    }

    const envelope = this.envelopes.of(event, address);
    return from(routes).pipe(
      tap((route) =>
        this.logger.debug(
          `${route.declaration} ← ${address.messageType} (${address.identifier}) as ` +
            `${address.routingKey}`,
        ),
      ),
      mergeMap((route) => route.send(envelope, address)),
      map(() => undefined),
    );
  }
}
