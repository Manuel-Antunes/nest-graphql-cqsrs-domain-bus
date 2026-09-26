import type { Database } from './database';

export class CredentialRecords {
  constructor(private readonly database: Database) {}

  /**
   * The author role, granted straight on the credential.
   *
   * It is the only thing this suite does around the application's own doors, and it is deliberate:
   * granting a role is not an operation of this service (the identity port does it, in code), and
   * opening an endpoint for it would be production surface existing because of a test. The domain
   * profile is promoted by the application itself on the next request.
   */
  promoteToAuthor(credentialId: string): Promise<void> {
    return this.promote(credentialId, 'author');
  }

  promote(credentialId: string, role: string): Promise<void> {
    return this.database.execute(
      'update auth_user set role = ? where id = ?',
      role,
      credentialId,
    );
  }

  async emailOf(credentialId: string): Promise<string | undefined> {
    const [row] = await this.database.query<{ email: string }>(
      'select email from auth_user where id = ?',
      credentialId,
    );
    return row?.email;
  }

  async exists(credentialId: string): Promise<boolean> {
    const rows = await this.database.query(
      'select id from auth_user where id = ?',
      credentialId,
    );
    return rows.length > 0;
  }

  forgetUserAgentsOf(credentialId: string): Promise<void> {
    return this.database.execute(
      `update session set user_agent = '' where user_id = ?`,
      credentialId,
    );
  }
}
