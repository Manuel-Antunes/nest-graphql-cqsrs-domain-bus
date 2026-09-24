import { Mail } from '@nestposts/mail/mail';

import type { AuthLinkNotificationData } from '../domain/auth/schemas/auth-link-notification.schema';
import type { MailRecipient } from './mail-recipient';
import { PasswordResetTemplate } from './templates/password-reset.email';

export class PasswordResetMail extends Mail {
  override subject = 'Reset your password';

  constructor(
    private readonly link: AuthLinkNotificationData,
    private readonly recipient: MailRecipient,
  ) {
    super();
  }

  prepare(): void {
    this.message
      .to(this.recipient.address, this.recipient.name ?? undefined)
      .view(PasswordResetTemplate, {
        url: this.link.url,
        email: this.recipient.address,
        expirationMinutes: this.link.expiresInMinutes,
      });
  }
}
