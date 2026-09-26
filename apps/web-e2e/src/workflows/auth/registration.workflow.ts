import type { AuthApi } from '../../infrastructure/auth/auth-api';
import type { CredentialRecords } from '../../infrastructure/database/credential-records';
import type { Mailbox } from '../../infrastructure/mail/mailbox';
import type { Account, Accounts } from '../../model/account';
import { EmailSubject } from '../../model/email';
import { Unique } from '../../support/unique';

export interface FreshAccountOptions {
  readonly domain?: string;
}

/**
 * The accounts every test needs, created the way a person would.
 *
 * Sign-up goes through `apps/web`'s OWN Better Auth endpoint, on the web's origin — the same one the
 * browser talks to — and an address has to be verified before it signs in, so each account is
 * verified by the link in the email it was sent: the web published the notification, the notificator
 * rendered and sent it, and Mailpit has it. An account that cannot be created is a stack whose email
 * does not work, and no test after it would mean anything.
 *
 * The roles are the one exception, granted straight on the credential: giving a role is not an
 * operation of this system (the identity port does it, in code), and opening an endpoint for it would
 * be production surface existing because of a test. The domain profile is promoted by the application
 * itself on the next request, which is the thing worth exercising.
 */
export class Registration {
  static readonly PASSWORD = 'segredo123';

  private static readonly VERIFICATION_TIMEOUT_MS = 60_000;

  constructor(
    private readonly authApi: AuthApi,
    private readonly mailbox: Mailbox,
    private readonly credentials: CredentialRecords,
  ) {}

  async seed(): Promise<Accounts> {
    const author = await this.signUp('autor@example.com', 'Autora');
    await this.credentials.promoteToAuthor(author.credentialId);
    const admin = await this.signUp('admin@example.com', 'Admin');
    await this.credentials.promote(admin.credentialId, 'admin');
    return {
      author,
      reader: await this.signUp('leitor@example.com', 'Leitor'),
      admin,
    };
  }

  async signUp(email: string, name: string): Promise<Account> {
    const { user } = await this.authApi.signUp({
      email,
      name,
      password: Registration.PASSWORD,
      callbackPath: '/feed',
    });
    await this.verify(email);
    return {
      email,
      name,
      password: Registration.PASSWORD,
      credentialId: user.id,
    };
  }

  /**
   * A new account of its own, signed up and verified by email, for a test that changes what it holds.
   * `domain` is for an address somebody else validates — Polar's checkout refuses `example.com`.
   */
  freshAccount(
    name: string,
    { domain }: FreshAccountOptions = {},
  ): Promise<Account> {
    return this.signUp(Unique.email(name, domain), name);
  }

  async freshAuthor(name: string): Promise<Account> {
    const account = await this.freshAccount(name);
    await this.credentials.promoteToAuthor(account.credentialId);
    return account;
  }

  async signUpUnverified(email: string, name: string): Promise<void> {
    await this.authApi.signUp({ email, name, password: Registration.PASSWORD });
  }

  private async verify(email: string): Promise<void> {
    const mail = await this.mailbox.waitFor(email, EmailSubject.VERIFY_EMAIL, {
      timeout: Registration.VERIFICATION_TIMEOUT_MS,
    });
    await this.authApi.follow(mail.link('/api/auth/verify-email'));
  }
}
