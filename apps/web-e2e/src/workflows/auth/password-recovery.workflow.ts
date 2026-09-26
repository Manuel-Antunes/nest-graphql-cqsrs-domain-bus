import type { Mailbox } from '../../infrastructure/mail/mailbox';
import { EmailSubject } from '../../model/email';
import type { WebApp } from '../../pages/web-app';

export class PasswordRecovery {
  constructor(
    private readonly app: WebApp,
    private readonly mailbox: Mailbox,
  ) {}

  async resetPassword(email: string, password: string): Promise<void> {
    await this.app.forgotPassword.open();
    await this.app.forgotPassword.requestReset(email);
    const mail = await this.mailbox.waitFor(email, EmailSubject.RESET_PASSWORD);
    await this.app.visit(mail.link('/api/auth/reset-password/'));
    await this.app.resetPassword.choose(password);
  }
}
