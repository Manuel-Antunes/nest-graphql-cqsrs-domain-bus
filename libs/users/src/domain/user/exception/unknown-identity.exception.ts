import type { CredentialId } from '../vo/credential-id';

export class UnknownIdentityException extends Error {
  constructor(readonly credentialId: CredentialId) {
    super(`o provedor de identidade não conhece a credencial ${credentialId}`);
    this.name = 'UnknownIdentityException';
  }
}
