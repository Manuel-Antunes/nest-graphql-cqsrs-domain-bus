import { Mail } from '@nestposts/mail/mail';

import type { OneTimePasswordNotificationData } from '../domain/auth/schemas/one-time-password-notification.schema';
import type { MailRecipient } from './mail-recipient';
import {
  ONE_TIME_PASSWORD_WORDING,
  OneTimePasswordTemplate,
} from './templates/one-time-password.email';

export class OneTimePasswordMail extends Mail {
  constructor(
    private readonly password: OneTimePasswordNotificationData,
    private readonly recipient: MailRecipient,
  ) {
    super();
  }

  prepare(): void {
    this.message
      .to(this.recipient.address, this.recipient.name ?? undefined)
      .subject(
        ONE_TIME_PASSWORD_WORDING[this.password.purpose].VERIFY_YOUR_EMAIL,
      )
      .view(OneTimePasswordTemplate, {
        code: this.password.code,
        email: this.recipient.address,
        purpose: this.password.purpose,
        expirationMinutes: this.password.expiresInMinutes,
      });
  }
}
