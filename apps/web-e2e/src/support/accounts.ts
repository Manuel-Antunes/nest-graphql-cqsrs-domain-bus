import { ServiceDatabase } from './database';

export interface Account {
  readonly email: string;
  readonly password: string;
  readonly name: string;
  readonly credentialId: string;
}

export interface Accounts {
  readonly author: Account;
  readonly reader: Account;
}

/**
 * The two accounts every authorization test needs, created the way a person would.
 *
 * Sign-up goes through `apps/web`'s OWN Better Auth endpoint, on the web's origin — the same one the
 * browser talks to — so the credential these tests log in with is a credential the application
 * issued, not a row somebody inserted.
 *
 * The author role is the one exception, granted straight on the credential: giving a role is not an
 * operation of this system (the identity port does it, in code), and opening an endpoint for it would
 * be production surface existing because of a test. The domain profile is promoted by the application
 * itself on the next request, which is the thing worth exercising.
 */
export class Registrar {
  static readonly PASSWORD = 'segredo123';

  constructor(
    private readonly webUrl: string,
    private readonly store: ServiceDatabase,
  ) {}

  async register(): Promise<Accounts> {
    const author = await this.signUp('autor@example.com', 'Autora');
    await this.store.promoteToAuthor(author.credentialId);
    return { author, reader: await this.signUp('leitor@example.com', 'Leitor') };
  }

  private async signUp(email: string, name: string): Promise<Account> {
    const response = await fetch(`${this.webUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: this.webUrl },
      body: JSON.stringify({ email, name, password: Registrar.PASSWORD }),
    });
    if (!response.ok) {
      throw new Error(`sign-up de ${email} falhou (${response.status}): ${await response.text()}`);
    }
    const { user } = (await response.json()) as { user: { id: string } };
    return { email, name, password: Registrar.PASSWORD, credentialId: user.id };
  }
}
