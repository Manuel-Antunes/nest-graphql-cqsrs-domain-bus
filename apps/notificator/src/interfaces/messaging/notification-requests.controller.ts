import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import type { OutboxEnvelope } from '@nestjs/outbox';
import { NotificationReceivedEvent } from '@nestposts/notifications/domain/notification/event/notification-received.event';
import { RetryPolicy } from '@nestposts/retry-policy/decorators/retry-policy.decorator';
import { EventAddress, EventIngestion } from '@nestposts/transport-eventbus';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@Controller()
@AllowAnonymous()
export class NotificationRequestsController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern(EventAddress.everyEventOf(NotificationReceivedEvent))
  @RetryPolicy({ maxRetries: 3 })
  notificationReceived(@Payload() envelope: OutboxEnvelope): Promise<void> {
    return this.ingestion.ingest(envelope);
  }
}
