import { Mail } from '@nestposts/mail/mail';

import type { EmailChangeNotificationData } from '../domain/auth/schemas/email-change-notification.schema';
import type { MailRecipient } from './mail-recipient';
import { EmailChangeTemplate } from './templates/email-change.email';

export class EmailChangeMail extends Mail {
  override subject = 'Confirm your email change';

  constructor(
    private readonly change: EmailChangeNotificationData,
    private readonly recipient: MailRecipient,
  ) {
    super();
  }

  prepare(): void {
    this.message
      .to(this.recipient.address, this.recipient.name ?? undefined)
      .view(EmailChangeTemplate, {
        url: this.change.url,
        currentEmail: this.recipient.address,
        newEmail: this.change.newEmail,
        expirationMinutes: this.change.expiresInMinutes,
      });
  }
}
