import type { Notification } from '../domain/notification/notification';
import type { OnDemandNotifiable } from '../domain/notification/on-demand-notifiable';
import { OnDemandNotifications } from '../domain/notification/on-demand-notifications';

export interface SentOnDemand {
  readonly notifiable: OnDemandNotifiable;
  readonly notification: Notification;
}

/** Keeps what it was asked to send, so a spec can read the notification a flow produced. */
export class RecordingOnDemandNotifications extends OnDemandNotifications {
  readonly sent: SentOnDemand[] = [];

  async send(
    notifiable: OnDemandNotifiable,
    notification: Notification,
    now: Date = new Date(),
  ): Promise<void> {
    notifiable.notify(notification, now);
    this.sent.push({ notifiable, notification });
  }

  /** The last notification sent of `type`, to whomever. */
  last(type: string): SentOnDemand | undefined {
    return this.sent.findLast((entry) => entry.notification.type === type);
  }
}
