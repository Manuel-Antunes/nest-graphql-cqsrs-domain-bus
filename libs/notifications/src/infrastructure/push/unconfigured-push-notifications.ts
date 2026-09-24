import { Logger } from '@nestjs/common';

import type { PushDelivery } from '../../domain/channel/push-notifications';
import { PushNotifications } from '../../domain/channel/push-notifications';

/**
 * What the `push` channel sends through when no provider is configured: nothing, said once per
 * message. Not a failure — retrying would not configure anything.
 */
export class UnconfiguredPushNotifications extends PushNotifications {
  private readonly logger = new Logger('PushNotifications');

  async send(tokens: readonly string[]): Promise<PushDelivery> {
    this.logger.warn(
      `push is not configured (FIREBASE_CREDENTIALS) — ${tokens.length} device(s) not notified`,
    );
    return { delivered: 0, failed: [] };
  }
}
