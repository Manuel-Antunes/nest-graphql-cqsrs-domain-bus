import { Mail } from '@nestposts/mail/mail';

import { APP_NAME } from '../domain/auth/app-name';
import type { AuthLinkNotificationData } from '../domain/auth/schemas/auth-link-notification.schema';
import type { MailRecipient } from './mail-recipient';
import { MagicLinkTemplate } from './templates/magic-link.email';

export class MagicLinkMail extends Mail {
  override subject = `Sign in to ${APP_NAME}`;

  constructor(
    private readonly link: AuthLinkNotificationData,
    private readonly recipient: MailRecipient,
  ) {
    super();
  }

  prepare(): void {
    this.message
      .to(this.recipient.address, this.recipient.name ?? undefined)
      .view(MagicLinkTemplate, {
        url: this.link.url,
        email: this.recipient.address,
        expirationMinutes: this.link.expiresInMinutes,
      });
  }
}
