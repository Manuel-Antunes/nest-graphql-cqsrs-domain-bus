import type { NotificationId } from '../notification/vo/notification-id';
import type { NotificationDelivery } from './notification-delivery';

export abstract class NotificationDeliveryRepository {
  abstract deliveredChannels(
    notificationId: NotificationId,
  ): Promise<ReadonlySet<string>>;
  /** Records a delivery; recording one twice is not an error. */
  abstract record(delivery: NotificationDelivery): Promise<void>;

  /**
   * **Sends, then records the delivery — committed together and on their own**, outside whatever
   * transaction the caller is in. A delivery is a fact about the outside world: the unit of work
   * around it rolling back does not unsend an email, so its record must not roll back either, or the
   * retry sends it twice. What `send` writes itself (the `database` channel's row) commits with the
   * record, and a `send` that throws records nothing.
   */
  abstract recordAfter(
    delivery: NotificationDelivery,
    send: () => Promise<void>,
  ): Promise<void>;
}
