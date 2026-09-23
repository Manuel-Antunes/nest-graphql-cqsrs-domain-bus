import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { POSTS_NAMESPACE } from '@nestposts/posts/domain/post/event/posts.namespace';
import {
  EventAddress,
  EventIngestion,
  TransportEvent,
} from '@nestposts/transport-eventbus';

@Controller()
export class PostEventsController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern(EventAddress.everyEventOf(POSTS_NAMESPACE))
  posts(@TransportEvent() event: DomainEvent): Promise<void> {
    return this.ingestion.ingest(event);
  }
}
