import { expect } from '@playwright/test';

import type { Mailbox } from '../../infrastructure/mail/mailbox';
import type { ReceivedMail } from '../../infrastructure/mail/received-mail';
import { EmailSubject } from '../../model/email';
import type { WebApp } from '../../pages/web-app';

export class AccountLifecycle {
  constructor(
    private readonly app: WebApp,
    private readonly mailbox: Mailbox,
  ) {}

  async requestEmailChange(
    email: string,
    newEmail: string,
  ): Promise<ReceivedMail> {
    await this.app.accountSettings.open();
    await this.app.accountSettings.changeEmail(newEmail);
    await expect(this.app.accountSettings.changeRequested).toBeVisible();
    return this.mailbox.waitFor(email, EmailSubject.CONFIRM_EMAIL_CHANGE);
  }

  async confirmEmailChange(
    confirmation: ReceivedMail,
    newEmail: string,
  ): Promise<void> {
    await this.app.visit(confirmation.link('/api/auth/verify-email'));
    const verification = await this.mailbox.waitFor(
      newEmail,
      EmailSubject.VERIFY_EMAIL,
    );
    await this.app.visit(verification.link('/api/auth/verify-email'));
  }

  async requestDeletion(): Promise<void> {
    await this.app.securitySettings.open();
    await this.app.securitySettings.requestAccountDeletion();
    await expect(this.app.securitySettings.deletionRequested).toBeVisible();
  }

  async confirmDeletion(email: string): Promise<void> {
    const mail = await this.mailbox.waitFor(
      email,
      EmailSubject.CONFIRM_ACCOUNT_DELETION,
    );
    await this.app.visit(mail.link('/api/auth/delete-user/callback'));
  }
}
