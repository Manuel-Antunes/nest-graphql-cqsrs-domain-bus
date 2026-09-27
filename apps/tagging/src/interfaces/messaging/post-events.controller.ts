import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import type { OutboxEnvelope } from '@nestjs/outbox';
import { POSTS_NAMESPACE } from '@nestposts/posts/domain/post/event/posts.namespace';
import { RetryPolicy } from '@nestposts/retry-policy/decorators/retry-policy.decorator';
import { EventAddress, EventIngestion } from '@nestposts/transport-eventbus';

@Controller()
export class PostEventsController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern(EventAddress.everyEventOf(POSTS_NAMESPACE))
  @RetryPolicy({ maxRetries: 3 })
  posts(@Payload() envelope: OutboxEnvelope): Promise<void> {
    return this.ingestion.ingest(envelope);
  }
}
