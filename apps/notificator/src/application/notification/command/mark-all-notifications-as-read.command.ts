import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler } from '@nestjs/cqrs';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { NotificationRecordRepository } from '@nestposts/notifications/domain/notification/notification-record.repository';

export namespace MarkAllNotificationsAsReadCommand {
  export class MarkAllNotificationsAsRead extends Command<number> {
    constructor(
      readonly reader: Pick<INotifiable, 'notifiableType' | 'notifiableId'>,
    ) {
      super();
    }
  }

  @CommandHandler(MarkAllNotificationsAsRead)
  export class Handler implements ICommandHandler<MarkAllNotificationsAsRead> {
    constructor(private readonly records: NotificationRecordRepository) {}

    async execute({ reader }: MarkAllNotificationsAsRead): Promise<number> {
      const unread = await this.records.findUnreadByNotifiable(
        reader.notifiableType,
        reader.notifiableId,
      );
      const now = new Date();
      for (const record of unread) {
        record.markAsRead(now);
      }
      await this.records.saveAll(unread);
      return unread.length;
    }
  }
}
