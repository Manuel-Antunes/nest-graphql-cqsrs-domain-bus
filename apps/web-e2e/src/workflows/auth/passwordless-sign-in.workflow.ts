import type { Mailbox } from '../../infrastructure/mail/mailbox';
import { EmailSubject } from '../../model/email';
import type { WebApp } from '../../pages/web-app';

export class PasswordlessSignIn {
  constructor(
    private readonly app: WebApp,
    private readonly mailbox: Mailbox,
  ) {}

  async withMagicLink(email: string): Promise<void> {
    await this.app.magicLink.open();
    await this.app.magicLink.request(email);
    const mail = await this.mailbox.waitFor(email, EmailSubject.MAGIC_LINK);
    await this.app.visit(mail.link('/api/auth/magic-link/verify'));
  }

  async withEmailedCode(email: string): Promise<void> {
    await this.app.emailOtp.open();
    await this.app.emailOtp.sendCode(email);
    const mail = await this.mailbox.waitFor(email, EmailSubject.SIGN_IN_CODE);
    await this.app.emailOtp.enter(mail.oneTimeCode());
  }
}
