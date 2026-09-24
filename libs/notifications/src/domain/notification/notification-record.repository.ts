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
  /** Stores every record in a single flush. */
  abstract saveAll(records: readonly NotificationRecord[]): Promise<void>;
  /**
   * Deletes the record for good. The delivery ledger keeps its rows, which is what stops a
   * redelivered event from storing the notification again.
   */
  abstract remove(record: NotificationRecord): Promise<void>;
  abstract findById(id: NotificationId): Promise<NotificationRecord | null>;
  /** The notifiable's notifications, newest first. */
  abstract findByNotifiable(
    notifiableType: string,
    notifiableId: string,
    page?: NotificationPage,
  ): Promise<NotificationRecord[]>;
  /** Every notification the notifiable has not read, with no page limit. */
  abstract findUnreadByNotifiable(
    notifiableType: string,
    notifiableId: string,
  ): Promise<NotificationRecord[]>;
  /** How many of the notifiable's notifications are unread. */
  abstract countUnread(
    notifiableType: string,
    notifiableId: string,
  ): Promise<number>;
}
