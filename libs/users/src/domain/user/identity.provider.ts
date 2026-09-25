import type { CredentialId } from './vo/credential-id';
import type { Email } from './vo/email';
import type { UserName } from './vo/user-name';

export interface Identity {
  readonly credentialId: CredentialId;
  readonly email: Email;
  readonly name: UserName;
  readonly role: string | null;
}

export abstract class IdentityProvider {
  abstract findById(credentialId: CredentialId): Promise<Identity | null>;

  abstract grantRole(
    credentialId: CredentialId,
    role: string,
  ): Promise<Identity>;

  abstract addRole(credentialId: CredentialId, role: string): Promise<Identity>;

  abstract removeRole(
    credentialId: CredentialId,
    role: string,
  ): Promise<Identity>;
}
