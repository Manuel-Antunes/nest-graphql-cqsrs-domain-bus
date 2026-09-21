import { Injectable, type PipeTransform } from '@nestjs/common';
import { envelopeFrom, reconstruct } from './event-reconstruction';

/**
 * **The step that turns the message into the event**, as a pipe — which is what `@TransportEvent()`
 * binds to the parameter.
 *
 * A pipe is the right shape for it, and not a service a controller calls: it runs where Nest already
 * transforms a handler's arguments, it composes with whatever else a controller wants done to the
 * payload (`@TransportEvent(new ValidationPipe())`), and it leaves the method body free to be the
 * reaction rather than the plumbing. The controller's parameter is then the domain event, typed:
 *
 * ```ts
 * @EventPattern('posts.PostCreated.*')
 * postCreated(@TransportEvent() event: PostCreatedEvent): Promise<void> {
 *   return this.ingestion.ingest(event);
 * }
 * ```
 *
 * It has no dependencies, which is why it can be instantiated by the decorator instead of resolved:
 * what it needs is the `@EventType` registry, and that is module state shared by the whole process.
 */
@Injectable()
export class TransportEventPipe implements PipeTransform<unknown, object> {
  transform(value: unknown): object {
    return reconstruct(envelopeFrom(value));
  }
}
