import { Logger } from '@nestjs/common';
import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler } from '@nestjs/cqrs';
import { NotificationDelivery } from '@nestposts/notifications/domain/delivery/notification-delivery';
import { NotificationDeliveryRepository } from '@nestposts/notifications/domain/delivery/notification-delivery.repository';
import type { NotificationReceivedEvent } from '@nestposts/notifications/domain/notification/event/notification-received.event';
import { Notification } from '@nestposts/notifications/domain/notification/notification';
import { NotificationRecipient } from '@nestposts/notifications/domain/notification/notification-recipient';
import { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';
import { NotificationId } from '@nestposts/notifications/domain/notification/vo/notification-id';
import { NotificationChannels } from '@nestposts/notifications/infrastructure/channels/notification-channels';

export namespace SendNotificationCommand {
  export class SendNotification extends Command<void> {
    constructor(
      readonly record: NotificationRecord,
      readonly channels: readonly string[],
      readonly recipient: NotificationRecipient,
    ) {
      super();
    }

    static of(event: NotificationReceivedEvent): SendNotification {
      return new SendNotification(
        NotificationRecord.restore({
          id: NotificationId.parse(event.notificationId),
          type: event.notificationType,
          notifiableType: event.notifiableType,
          notifiableId: event.notifiableId,
          data: event.data,
          readAt: null,
          createdAt: event.occurredAt,
        }),
        event.channels,
        new NotificationRecipient({
          notifiableType: event.notifiableType,
          notifiableId: event.notifiableId,
          notifiableName: event.recipient.notifiableName,
          routes: event.recipient.routes,
        }),
      );
    }
  }

  @CommandHandler(SendNotification)
  export class Handler implements ICommandHandler<SendNotification> {
    private readonly logger = new Logger(SendNotification.name);

    constructor(
      private readonly channels: NotificationChannels,
      private readonly deliveries: NotificationDeliveryRepository,
    ) {}

    async execute({
      record,
      channels,
      recipient,
    }: SendNotification): Promise<void> {
      const notification = Notification.restore(record);
      const delivered = await this.deliveries.deliveredChannels(record.id);
      for (const name of channels) {
        if (delivered.has(name)) {
          this.logger.debug(
            `${record.type} ${record.id} already went through "${name}" — not again`,
          );
          continue;
        }
        await this.channels.named(name).deliver(notification, recipient);
        await this.deliveries.record(
          NotificationDelivery.of(record.id, name, new Date()),
        );
        this.logger.log(
          `${record.type} ${record.id} delivered to ${recipient.notifiableType} ${recipient.notifiableId} through "${name}"`,
        );
      }
    }
  }
}
