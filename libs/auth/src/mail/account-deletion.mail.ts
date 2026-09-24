import { Mail } from '@nestposts/mail/mail';

import type { AuthLinkNotificationData } from '../domain/auth/schemas/auth-link-notification.schema';
import type { MailRecipient } from './mail-recipient';
import { AccountDeletionTemplate } from './templates/account-deletion.email';

const MINUTES_IN_AN_HOUR = 60;

export class AccountDeletionMail extends Mail {
  override subject = 'Confirm the deletion of your account';

  constructor(
    private readonly link: AuthLinkNotificationData,
    private readonly recipient: MailRecipient,
  ) {
    super();
  }

  prepare(): void {
    this.message
      .to(this.recipient.address, this.recipient.name ?? undefined)
      .view(AccountDeletionTemplate, {
        url: this.link.url,
        email: this.recipient.address,
        expirationHours: Math.max(
          1,
          Math.round(this.link.expiresInMinutes / MINUTES_IN_AN_HOUR),
        ),
      });
  }
}
