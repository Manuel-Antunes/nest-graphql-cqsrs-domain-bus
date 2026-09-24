import { Injectable } from '@nestjs/common';

import { DATABASE_CHANNEL } from '../../domain/channel/channel-names';
import { NotificationChannel } from '../../domain/channel/notification-channel';
import type { Notification } from '../../domain/notification/notification';
import { NotificationRecordRepository } from '../../domain/notification/notification-record.repository';

/** Stores the notification's record, once: a redelivery finds it there and leaves it alone. */
@Injectable()
export class DatabaseChannel extends NotificationChannel {
  readonly name = DATABASE_CHANNEL;

  constructor(private readonly records: NotificationRecordRepository) {
    super();
  }

  async deliver(notification: Notification): Promise<void> {
    await this.records.saveIfAbsent(notification.record);
  }
}
