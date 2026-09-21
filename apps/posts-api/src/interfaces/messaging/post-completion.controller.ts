import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { EventIngestion, TransportEvent, everyEventOf } from '@nestposts/transport-eventbus';

/**
 * The saga coming back: the post returning complete from the service that decided its first tag.
 *
 * One type, any aggregate — this service owns the read model and wants the decision, not the whole
 * namespace it publishes itself.
 */
export const POST_COMPLETED_PATTERN = everyEventOf(PostCreatedEvent);

/**
 * `@AllowAnonymous` because a message carries no session, and the global guard — inherited by the
 * microservice along with the filters and interceptors — would answer `UNAUTHORIZED` to every
 * delivery. What authorises this entry is the queue it arrived on: whoever can publish to the
 * exchange is inside the system already.
 */
@AllowAnonymous()
@Controller()
export class PostCompletionController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern(POST_COMPLETED_PATTERN)
  postCompleted(@TransportEvent() event: PostCreatedEvent): Promise<void> {
    return this.ingestion.ingest(event);
  }
}
