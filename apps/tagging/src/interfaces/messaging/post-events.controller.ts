import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { POSTS_NAMESPACE } from '@nestposts/posts/domain/post/event/posts.namespace';
import { RetryPolicy } from '@nestposts/retry-policy/decorators/retry-policy.decorator';
import {
  EventAddress,
  EventIngestion,
  TransportEvent,
} from '@nestposts/transport-eventbus';

import { POST_EVENTS_MAX_RETRIES } from '../../infrastructure/transport/transport.config';

@Controller()
export class PostEventsController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern(EventAddress.everyEventOf(POSTS_NAMESPACE))
  @RetryPolicy({ maxRetries: POST_EVENTS_MAX_RETRIES })
  posts(@TransportEvent() event: DomainEvent): Promise<void> {
    return this.ingestion.ingest(event);
  }
}
