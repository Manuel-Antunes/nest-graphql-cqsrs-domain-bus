import { Injectable, Logger } from '@nestjs/common';

import type { Notification } from '../../domain/notification/notification';
import type { OnDemandNotifiable } from '../../domain/notification/on-demand-notifiable';
import { OnDemandNotifications } from '../../domain/notification/on-demand-notifications';

/**
 * Sends nothing and says so, for a process that has no transport to send through — the migrator,
 * whose seeders sign users up through Better Auth and so ask for verification emails nobody should
 * get.
 *
 * It logs the notification's type and whom it was for, never its data: that is where a reset link or
 * a one-time code would be.
 */
@Injectable()
export class LoggingOnDemandNotifications extends OnDemandNotifications {
  private readonly logger = new Logger(LoggingOnDemandNotifications.name);

  async send(
    notifiable: OnDemandNotifiable,
    notification: Notification,
  ): Promise<void> {
    this.logger.log(
      `${notification.type} for ${notifiable.notifiableId} not sent: this process has no transport to send notifications through`,
    );
  }
}
