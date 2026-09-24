import type { ServiceDatabase } from './database';
import { linkIn, Mailbox } from './mailbox';

export interface Account {
  readonly email: string;
  readonly password: string;
  readonly name: string;
  readonly credentialId: string;
}

export interface Accounts {
  readonly author: Account;
  readonly reader: Account;
  readonly admin: Account;
}

export const VERIFY_EMAIL_SUBJECT = 'Verify your email address';

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
export class Registrar {
  static readonly PASSWORD = 'segredo123';

  private readonly mailbox = new Mailbox();

  constructor(
    private readonly webUrl: string,
    private readonly store: ServiceDatabase,
  ) {}

  async register(): Promise<Accounts> {
    const author = await this.signUp('autor@example.com', 'Autora');
    await this.store.promoteToAuthor(author.credentialId);
    const admin = await this.signUp('admin@example.com', 'Admin');
    await this.store.promote(admin.credentialId, 'admin');
    return {
      author,
      reader: await this.signUp('leitor@example.com', 'Leitor'),
      admin,
    };
  }

  async signUp(email: string, name: string): Promise<Account> {
    const response = await fetch(`${this.webUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': this.webUrl },
      body: JSON.stringify({
        email,
        name,
        password: Registrar.PASSWORD,
        callbackURL: `${this.webUrl}/feed`,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `sign-up of ${email} failed (${response.status}): ${await response.text()}`,
      );
    }
    const { user } = (await response.json()) as { user: { id: string } };
    await this.verify(email);
    return { email, name, password: Registrar.PASSWORD, credentialId: user.id };
  }

  private async verify(email: string): Promise<void> {
    const mail = await this.mailbox.waitFor(email, VERIFY_EMAIL_SUBJECT, {
      timeout: 60_000,
    });
    const verified = await fetch(linkIn(mail, '/api/auth/verify-email'), {
      redirect: 'manual',
    });
    if (verified.status >= 400) {
      throw new Error(
        `verifying ${email} failed (${verified.status}): ${await verified.text()}`,
      );
    }
  }
}
