import type { NotificationRecord } from './notification-record.entity';
import type { NotificationId } from './vo/notification-id';

export interface NotificationPage {
  unreadOnly?: boolean;
  limit?: number;
}

export abstract class NotificationRecordRepository {
  /** Stores a record unless one with its id exists already; answers whether it stored it. */
  abstract saveIfAbsent(record: NotificationRecord): Promise<boolean>;
  abstract save(record: NotificationRecord): Promise<void>;
  abstract findById(id: NotificationId): Promise<NotificationRecord | null>;
  /** The notifiable's notifications, newest first. */
  abstract findByNotifiable(
    notifiableType: string,
    notifiableId: string,
    page?: NotificationPage,
  ): Promise<NotificationRecord[]>;
}
