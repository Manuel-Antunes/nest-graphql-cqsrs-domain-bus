import type { Notification } from '../notification/notification';
import type { NotificationRecipient } from '../notification/notification-recipient';

/**
 * One way a notification reaches its recipient: `database`, `email`, `push`.
 *
 * `deliver` either delivers or throws. Throwing is what makes the delivery retried; a channel that
 * cannot deliver and never will — no route, no provider — returns without delivering, because a retry
 * would change nothing.
 */
export abstract class NotificationChannel {
  abstract readonly name: string;
  abstract deliver(
    notification: Notification,
    recipient: NotificationRecipient,
  ): Promise<void>;
}
