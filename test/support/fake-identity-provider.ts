import { type Identity, IdentityProvider } from '../../src/domain/user/identity.provider';
import { CredentialId } from '../../src/domain/user/vo/credential-id';
import { Email } from '../../src/domain/user/vo/email';
import { UserName } from '../../src/domain/user/vo/user-name';

/**
 * O provedor de identidade dos testes — o duplo do Better Auth.
 *
 * Ele existe porque a porta existe: desde que o `UserProvisioning` passou a perguntar *quem é esta
 * credencial* em vez de receber um retrato pronto, testá-lo pede alguém do outro lado que responda. E
 * é o que prova que a porta cumpre o que promete — este arquivo não importa `better-auth`, e o
 * serviço não nota a diferença.
 *
 * Repare no que ele **não** precisa simular: contas. Ligar a credencial do Google à identidade de
 * quem já tinha senha acontece inteiro do lado do provedor (`account.accountLinking`), e o que sai
 * daqui, como de lá, é uma identidade já resolvida. Entrar por outro caminho é, para este duplo,
 * a mesma credencial de sempre — que é exatamente o que o provisionamento deve enxergar.
 */
export class FakeIdentityProvider extends IdentityProvider {
  private readonly credentials = new Map<string, Identity>();
  private sequence = 0;

  /** Registra uma credencial nova, como um sign-up faria. Devolve o id dela. */
  signUp(email: string, name: string, role: string | null = null): CredentialId {
    const credentialId = CredentialId.parse(`cred-${++this.sequence}`);
    this.credentials.set(credentialId.value, {
      credentialId,
      email: Email.parse(email),
      name: UserName.parse(name),
      role,
    });
    return credentialId;
  }

  /** Esquece a credencial — a sessão que sobreviveu à identidade que a emitiu. */
  forget(credentialId: CredentialId): void {
    this.credentials.delete(credentialId.value);
  }

  async findById(credentialId: CredentialId): Promise<Identity | null> {
    return this.credentials.get(credentialId.value) ?? null;
  }

  async grantRole(credentialId: CredentialId, role: string): Promise<Identity> {
    const identity = this.credentials.get(credentialId.value);
    if (!identity) {
      throw new Error(`credencial desconhecida: ${credentialId}`);
    }
    const updated = { ...identity, role };
    this.credentials.set(credentialId.value, updated);
    return updated;
  }
}
