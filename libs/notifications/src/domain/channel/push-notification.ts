import type { Notification } from '../notification/notification';
import type { NotificationRecipient } from '../notification/notification-recipient';
import type { PushMessage } from './schemas/push-message.schema';

/** A notification that can be pushed to a device — what the `push` channel delivers. */
export interface PushNotification {
  toPush(recipient: NotificationRecipient): PushMessage;
}

/** Whether a notification implements {@link PushNotification}. */
export const isPushNotification = (
  notification: Notification,
): notification is Notification & PushNotification =>
  typeof (notification as Partial<PushNotification>).toPush === 'function';
