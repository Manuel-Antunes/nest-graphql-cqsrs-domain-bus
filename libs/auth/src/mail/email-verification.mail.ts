import { Mail } from '@nestposts/mail/mail';

import type { AuthLinkNotificationData } from '../domain/auth/schemas/auth-link-notification.schema';
import type { MailRecipient } from './mail-recipient';
import { EmailVerificationTemplate } from './templates/email-verification.email';

export class EmailVerificationMail extends Mail {
  override subject = 'Verify your email address';

  constructor(
    private readonly link: AuthLinkNotificationData,
    private readonly recipient: MailRecipient,
  ) {
    super();
  }

  prepare(): void {
    this.message
      .to(this.recipient.address, this.recipient.name ?? undefined)
      .view(EmailVerificationTemplate, {
        url: this.link.url,
        email: this.recipient.address,
        expirationMinutes: this.link.expiresInMinutes,
      });
  }
}
