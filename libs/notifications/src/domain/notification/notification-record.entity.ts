import { BaseEntity } from '@nestposts/platform/domain/shared/base-entity';

import type { INotifiable } from './notifiable';
import { NotificationId } from './vo/notification-id';

export type NotificationData = Record<string, unknown>;

export interface NotificationRecordState {
  id: NotificationId;
  type: string;
  notifiableType?: string;
  notifiableId?: string;
  data: NotificationData;
  readAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * A notification's data, and the row it is stored as: what it is (`type`), who it is for, what it
 * says and whether it was read.
 *
 * A {@link Notification} is behaviour — which channels, how it reads as an email — and holds one of
 * these as its data. The `database` channel stores it as it is.
 */
export class NotificationRecord extends BaseEntity<NotificationRecordState> {
  id!: NotificationId;
  type!: string;
  notifiableType!: string;
  notifiableId!: string;
  data!: NotificationData;
  readAt!: Date | null;

  static draft(type: string, data: NotificationData): NotificationRecord {
    return new NotificationRecord({
      id: NotificationId.generate(),
      type,
      data,
      readAt: null,
    });
  }

  static restore(
    state: Required<Omit<NotificationRecordState, 'updatedAt'>> & {
      updatedAt?: Date;
    },
  ): NotificationRecord {
    return new NotificationRecord({
      ...state,
      updatedAt: state.updatedAt ?? state.createdAt,
    });
  }

  /**
   * Binds the record to whom it is for. With a `key`, the id is derived from the type, the key and the
   * notifiable, so notifying the same thing twice yields the same notification.
   */
  addressTo(notifiable: INotifiable, now: Date, key?: string): void {
    this.notifiableType = notifiable.notifiableType;
    this.notifiableId = notifiable.notifiableId;
    if (key !== undefined) {
      this.id = NotificationId.derive(
        this.type,
        key,
        notifiable.notifiableType,
        notifiable.notifiableId,
      );
    }
    this.stampCreation(now);
  }

  isAddressedTo(notifiableType: string, notifiableId: string): boolean {
    return (
      this.notifiableType === notifiableType &&
      this.notifiableId === notifiableId
    );
  }

  get read(): boolean {
    return this.readAt !== null;
  }

  markAsRead(at: Date): void {
    if (this.read) return;
    this.readAt = at;
    this.touch(at);
  }

  markAsUnread(at: Date): void {
    if (!this.read) return;
    this.readAt = null;
    this.touch(at);
  }
}
