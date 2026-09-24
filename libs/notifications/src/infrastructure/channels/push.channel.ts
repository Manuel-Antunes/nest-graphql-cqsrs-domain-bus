import { Injectable, Logger } from '@nestjs/common';

import { PUSH_CHANNEL } from '../../domain/channel/channel-names';
import { NotificationChannel } from '../../domain/channel/notification-channel';
import { isPushNotification } from '../../domain/channel/push-notification';
import { PushNotifications } from '../../domain/channel/push-notifications';
import { DeviceRepository } from '../../domain/device/device.repository';
import type { Notification } from '../../domain/notification/notification';
import type { NotificationRecipient } from '../../domain/notification/notification-recipient';

export class PushDeliveryFailedException extends Error {
  constructor(type: string, reasons: string[]) {
    super(`no device received ${type}: ${reasons.join('; ')}`);
    this.name = 'PushDeliveryFailedException';
  }
}

/**
 * Pushes a notification's `toPush` to every device of its recipient. It fails — and is retried — only
 * when there were devices and none of them received it.
 */
@Injectable()
export class PushChannel extends NotificationChannel {
  readonly name = PUSH_CHANNEL;
  private readonly logger = new Logger(PushChannel.name);

  constructor(
    private readonly devices: DeviceRepository,
    private readonly push: PushNotifications,
  ) {
    super();
  }

  async deliver(
    notification: Notification,
    recipient: NotificationRecipient,
  ): Promise<void> {
    if (!isPushNotification(notification)) {
      this.logger.warn(
        `${notification.type} goes through "${PUSH_CHANNEL}" and is no PushNotification — nothing pushed`,
      );
      return;
    }
    const devices = await this.devices.findByNotifiable(
      recipient.notifiableType,
      recipient.notifiableId,
    );
    if (devices.length === 0) return;
    const result = await this.push.send(
      devices.map((device) => device.token),
      notification.toPush(recipient),
    );
    for (const failure of result.failed) {
      this.logger.warn(
        `push to ${failure.token.slice(0, 10)}… failed: ${failure.reason}`,
      );
    }
    if (result.delivered === 0 && result.failed.length > 0) {
      throw new PushDeliveryFailedException(
        notification.type,
        result.failed.map((failure) => failure.reason),
      );
    }
  }
}
