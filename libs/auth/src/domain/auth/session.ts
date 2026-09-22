import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import type { Email } from '@nestposts/users/domain/user/vo/email';
import type { UserName } from '@nestposts/users/domain/user/vo/user-name';

export interface SessionUser {
  readonly credentialId: CredentialId;
  readonly email: Email;
  readonly name: UserName;
  readonly roles: readonly string[];
}

export interface Session {
  readonly user: SessionUser;
  readonly token: string;
  readonly expiresAt: Date;
  /**
   * The organization the session points at, as the row carries it.
   *
   * A plain string, and not an `OrganizationId`, because the column belongs to Better Auth's
   * `session` while the value object belongs to `@nestposts/organizations` — which is built ON this
   * package. Whoever has a notion of an organization parses it; whoever does not still sees it.
   */
  readonly activeOrganizationId: string | null;
}
