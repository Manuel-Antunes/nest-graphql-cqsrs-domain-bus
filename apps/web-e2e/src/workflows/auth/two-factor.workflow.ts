import type { SignedInAuthApi } from '../../infrastructure/auth/signed-in-auth-api';
import type { Mailbox } from '../../infrastructure/mail/mailbox';
import { EmailSubject } from '../../model/email';
import type { WebApp } from '../../pages/web-app';
import { Totp } from '../../support/totp';

export class TwoFactor {
  constructor(
    private readonly app: WebApp,
    private readonly mailbox: Mailbox,
    private readonly api: SignedInAuthApi,
  ) {}

  async enrollAuthenticator(password: string): Promise<void> {
    const { totpURI } = await this.api.enableTwoFactor(password);
    const secret = new URL(totpURI).searchParams.get('secret') as string;
    await this.api.verifyTotp(Totp.now(secret));
  }

  async completeWithEmailedCode(email: string): Promise<void> {
    await this.app.twoFactor.askForEmailedCode();
    const mail = await this.mailbox.waitFor(
      email,
      EmailSubject.TWO_FACTOR_CODE,
    );
    await this.app.twoFactor.enterEmailedCode(mail.oneTimeCode());
  }
}
