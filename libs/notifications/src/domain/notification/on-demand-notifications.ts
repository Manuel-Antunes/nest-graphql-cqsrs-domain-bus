import type { Notification } from './notification';
import type { OnDemandNotifiable } from './on-demand-notifiable';

/**
 * Sends a notification to someone known only by an address, from code that is saving no aggregate —
 * a Better Auth callback asking for a password-reset email, an invitation going out.
 *
 * An aggregate that is {@link Notifiable} needs none of this: it is notified inside a command, and its
 * `NotificationReceivedEvent` leaves with the rest of its events at `commit()`. Here there is no
 * command and no aggregate, so `send` is what publishes, and it resolves once the notification has
 * left this process — a caller that awaits it has handed the email over, which matters in a function
 * that is frozen the moment it returns.
 */
export abstract class OnDemandNotifications {
  abstract send(
    notifiable: OnDemandNotifiable,
    notification: Notification,
    now?: Date,
  ): Promise<void>;
}
