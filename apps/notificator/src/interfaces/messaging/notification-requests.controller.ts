import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { NotificationReceivedEvent } from '@nestposts/notifications/domain/notification/event/notification-received.event';
import { RetryPolicy } from '@nestposts/retry-policy/decorators/retry-policy.decorator';
import {
  EventAddress,
  EventIngestion,
  TransportEvent,
} from '@nestposts/transport-eventbus';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@Controller()
@AllowAnonymous()
export class NotificationRequestsController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern(EventAddress.everyEventOf(NotificationReceivedEvent))
  @RetryPolicy({ maxRetries: 3 })
  notificationReceived(
    @TransportEvent() event: NotificationReceivedEvent,
  ): Promise<void> {
    return this.ingestion.ingest(event);
  }
}
