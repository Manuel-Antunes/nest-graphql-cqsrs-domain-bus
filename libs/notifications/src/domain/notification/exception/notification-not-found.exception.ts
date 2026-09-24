import type { NotificationId } from '../vo/notification-id';

export class NotificationNotFoundException extends Error {
  constructor(readonly notificationId: NotificationId) {
    super(`notification ${notificationId} does not exist`);
    this.name = 'NotificationNotFoundException';
  }
}
