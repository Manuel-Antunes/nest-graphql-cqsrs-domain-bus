import type { NotificationId } from '../notification/vo/notification-id';
import type { NotificationDelivery } from './notification-delivery';

export abstract class NotificationDeliveryRepository {
  abstract deliveredChannels(
    notificationId: NotificationId,
  ): Promise<ReadonlySet<string>>;
  /** Records a delivery; recording one twice is not an error. */
  abstract record(delivery: NotificationDelivery): Promise<void>;
}
