import type { CredentialId } from '../vo/credential-id';

/**
 * O provedor de identidade não conhece esta credencial.
 *
 * Não é um erro de validação: é uma sessão que sobreviveu à identidade que a emitiu — a credencial
 * foi removida do provedor e o cookie continuou no browser. Vale um tipo próprio porque a resposta
 * certa é "autentique de novo", e não "o dado que você mandou está errado".
 */
export class UnknownIdentityException extends Error {
  constructor(readonly credentialId: CredentialId) {
    super(`o provedor de identidade não conhece a credencial ${credentialId}`);
    this.name = 'UnknownIdentityException';
  }
}
