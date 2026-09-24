import { Injectable, Logger } from '@nestjs/common';
import { MailSender } from '@nestposts/mail/mail-sender';

import { EMAIL_CHANNEL } from '../../domain/channel/channel-names';
import { isMailNotification } from '../../domain/channel/mail-notification';
import { NotificationChannel } from '../../domain/channel/notification-channel';
import type { Notification } from '../../domain/notification/notification';
import type { NotificationRecipient } from '../../domain/notification/notification-recipient';

/** Sends the mail a notification's `toMail` builds, through whatever `MailSender` is bound. */
@Injectable()
export class MailChannel extends NotificationChannel {
  readonly name = EMAIL_CHANNEL;
  private readonly logger = new Logger(MailChannel.name);

  constructor(private readonly sender: MailSender) {
    super();
  }

  async deliver(
    notification: Notification,
    recipient: NotificationRecipient,
  ): Promise<void> {
    if (!isMailNotification(notification)) {
      this.logger.warn(
        `${notification.type} goes through "${EMAIL_CHANNEL}" and is no MailNotification — nothing sent`,
      );
      return;
    }
    if (!recipient.routeNotificationFor(EMAIL_CHANNEL)) {
      this.logger.warn(
        `${recipient.notifiableType} ${recipient.notifiableId} has no email address — ${notification.type} not mailed`,
      );
      return;
    }
    await this.sender.send(await notification.toMail(recipient));
  }
}
