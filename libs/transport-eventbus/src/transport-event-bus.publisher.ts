import { Injectable } from '@nestjs/common';
import { type EventBus, EventPublisher } from '@nestjs/cqrs';
import { TransportEventBusService } from './transport-event-bus.service';

/**
 * The `EventPublisher` that binds an aggregate to the transport bus — upstream's class, unchanged.
 *
 * ```ts
 * const post = this.publisher.mergeObjectContext(
 *   await this.posts.findById(id),
 *   this.request,          // the request context, propagated from the edge
 * );
 * post.update(changes);
 * await this.posts.save(post);
 * post.commit();           // every event raised now goes out as well
 * ```
 *
 * It is what makes the integration invisible to the domain: the aggregate applies events the way it
 * always did, and `commit()` is what decides they are facts — locally and on the wire, in that order.
 *
 * The second argument is the piece worth noticing: it stamps the request onto every event the
 * aggregate raises, which is what {@link RequestContextCodec} then writes onto the envelope. Without
 * it the events still cross, but they cross as if nobody had asked for them.
 */
@Injectable()
export class TransportEventBusPublisher extends EventPublisher {
  constructor(transportEventBus: TransportEventBusService) {
    super(transportEventBus as unknown as EventBus);
  }
}
