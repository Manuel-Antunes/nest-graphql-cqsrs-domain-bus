import type { Mail } from '@nestposts/mail/mail';

import type { Notification } from '../notification/notification';
import type { NotificationRecipient } from '../notification/notification-recipient';

/**
 * A notification that can be told by email — what the `email` channel delivers.
 *
 * ```ts
 * export class PostCreatedNotification extends Notification<PostCreatedNotificationData>
 *   implements MailNotification {
 *   toMail(recipient: NotificationRecipient) {
 *     return new PostCreatedNotificationMail(this.data, recipient);
 *   }
 * }
 * ```
 */
export interface MailNotification {
  toMail(recipient: NotificationRecipient): Mail | Promise<Mail>;
}

/** Whether a notification implements {@link MailNotification}. */
export const isMailNotification = (
  notification: Notification,
): notification is Notification & MailNotification =>
  typeof (notification as Partial<MailNotification>).toMail === 'function';
