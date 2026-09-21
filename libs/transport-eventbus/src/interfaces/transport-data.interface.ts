import type { IEvent } from '@nestjs/cqrs';

/**
 * Upstream's wire shape: the event's own properties, plus the name to rebuild it under.
 *
 * It is kept because it is the contract of upstream's `@TransportEvent()`, and because it is the
 * smallest thing that can cross — an application that wants nothing this repository added can still
 * publish and receive exactly this. {@link EventEnvelope} is what the integrated path sends instead,
 * and it carries this same pair (as `payload` and `messageType`) plus what an inbox, a routing key and
 * a propagated request need.
 */
export interface ITransportDataEventBus {
  readonly payload: IEvent;
  readonly eventName: string;
}
