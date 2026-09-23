import type { PipeTransform, Type } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';

import { TransportEventPipe } from '../inbound/transport-event.pipe';

/**
 * **The receiving side, in one parameter.** Upstream's decorator, now Nest's own payload pipeline:
 *
 * ```ts
 * @EventPattern('posts.PostPreCreated.*')
 * postPreCreated(@TransportEvent() event: PostPreCreatedEvent): Promise<void> {
 *   return this.ingestion.ingest(event);
 * }
 * ```
 *
 * The parameter arrives as an instance of the **real class**, with its dates, marked with where it
 * came from — the transport's {@link EventEnvelopeDeserializer} read the envelope, and
 * {@link TransportEventPipe} rebuilt the event from it. Nothing in the controller parses anything.
 *
 * Extra pipes run after it, on the event: `@TransportEvent(new ValidationPipe())`.
 *
 * What this path does **not** give on its own is idempotency and a transaction: a broker delivers at
 * least once, and the second delivery of the same message reaches the handlers again.
 * {@link EventIngestion} is what adds the inbox, the sink and the local publish around it, which is
 * what the applications in this repository hand the event to.
 */
export const TransportEvent = (
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator => Payload(new TransportEventPipe(), ...pipes);
