import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler } from '@nestjs/cqrs';
import { NotificationNotFoundException } from '@nestposts/notifications/domain/notification/exception/notification-not-found.exception';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { NotificationRecordRepository } from '@nestposts/notifications/domain/notification/notification-record.repository';
import type { NotificationId } from '@nestposts/notifications/domain/notification/vo/notification-id';

export namespace MarkNotificationAsReadCommand {
  export class MarkNotificationAsRead extends Command<void> {
    constructor(
      readonly notificationId: NotificationId,
      readonly reader: Pick<INotifiable, 'notifiableType' | 'notifiableId'>,
    ) {
      super();
    }
  }

  @CommandHandler(MarkNotificationAsRead)
  export class Handler implements ICommandHandler<MarkNotificationAsRead> {
    constructor(private readonly records: NotificationRecordRepository) {}

    async execute({
      notificationId,
      reader,
    }: MarkNotificationAsRead): Promise<void> {
      const record = await this.records.findById(notificationId);
      if (!record?.isAddressedTo(reader.notifiableType, reader.notifiableId)) {
        throw new NotificationNotFoundException(notificationId);
      }
      record.markAsRead(new Date());
      await this.records.save(record);
    }
  }
}
