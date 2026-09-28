import type { Database } from './database';
import type { StoredAttachment } from './post-records';

export type StoredAvatar = NonNullable<StoredAttachment['asset']>;

export class CredentialRecords {
  constructor(private readonly database: Database) {}

  /**
   * The author role, granted straight on the credential.
   *
   * It is the only thing this suite does around the application's own doors, and it is deliberate:
   * granting a role is not an operation of this service (the identity port does it, in code), and
   * opening an endpoint for it would be production surface existing because of a test. The domain
   * authorship is created by the application itself on the next request.
   */
  promoteToAuthor(credentialId: string): Promise<void> {
    return this.promote(credentialId, 'author');
  }

  promote(credentialId: string, role: string): Promise<void> {
    return this.database.execute(
      'update users set role = ? where id = ?',
      role,
      credentialId,
    );
  }

  async emailOf(credentialId: string): Promise<string | undefined> {
    const [row] = await this.database.query<{ email: string }>(
      'select email from users where id = ?',
      credentialId,
    );
    return row?.email;
  }

  async avatarOf(email: string): Promise<StoredAvatar | null> {
    const [row] = await this.database.query<{ image: StoredAvatar | null }>(
      'select image from users where email = ?',
      email,
    );
    return row?.image ?? null;
  }

  async isActive(credentialId: string): Promise<boolean> {
    const rows = await this.database.query(
      'select id from users where id = ? and deleted_at is null',
      credentialId,
    );
    return rows.length > 0;
  }

  async isDeleted(credentialId: string): Promise<boolean> {
    const rows = await this.database.query(
      'select id from users where id = ? and deleted_at is not null',
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
