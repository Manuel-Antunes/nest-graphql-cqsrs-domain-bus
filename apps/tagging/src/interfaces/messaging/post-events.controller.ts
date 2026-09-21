import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { POSTS_NAMESPACE } from '@nestposts/posts/domain/post/event/posts.namespace';
import { EventAddress, EventIngestion, TransportEvent } from '@nestposts/transport-eventbus';

/** One queue, one binding, one entry: everything the `posts` namespace states. */
export const POST_EVENTS_PATTERN = EventAddress.everyEventOf(POSTS_NAMESPACE);

/**
 * This service reacts to one of these events and replicates the rest, and it binds **the namespace**
 * rather than a list of types: it keeps the Post's stream in its own log, and a stream missing the
 * events somebody added last week is a stream a decision is then taken against.
 *
 * There is one method because there is one thing to do with any of them — remember it. Which event
 * arrived is the envelope's business, and `@TransportEvent()` answers with the concrete class, so the
 * saga that acts on `PostPreCreated` matches it exactly as if a local command had raised it.
 */
@Controller()
export class PostEventsController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern(POST_EVENTS_PATTERN)
  posts(@TransportEvent() event: DomainEvent): Promise<void> {
    return this.ingestion.ingest(event);
  }
}
