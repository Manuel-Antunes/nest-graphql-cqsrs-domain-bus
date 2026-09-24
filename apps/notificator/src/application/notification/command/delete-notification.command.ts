import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler } from '@nestjs/cqrs';
import { NotificationNotFoundException } from '@nestposts/notifications/domain/notification/exception/notification-not-found.exception';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { NotificationRecordRepository } from '@nestposts/notifications/domain/notification/notification-record.repository';
import type { NotificationId } from '@nestposts/notifications/domain/notification/vo/notification-id';

export namespace DeleteNotificationCommand {
  export class DeleteNotification extends Command<void> {
    constructor(
      readonly notificationId: NotificationId,
      readonly owner: Pick<INotifiable, 'notifiableType' | 'notifiableId'>,
    ) {
      super();
    }
  }

  @CommandHandler(DeleteNotification)
  export class Handler implements ICommandHandler<DeleteNotification> {
    constructor(private readonly records: NotificationRecordRepository) {}

    async execute({
      notificationId,
      owner,
    }: DeleteNotification): Promise<void> {
      const record = await this.records.findById(notificationId);
      if (!record?.isAddressedTo(owner.notifiableType, owner.notifiableId)) {
        throw new NotificationNotFoundException(notificationId);
      }
      await this.records.remove(record);
    }
  }
}
