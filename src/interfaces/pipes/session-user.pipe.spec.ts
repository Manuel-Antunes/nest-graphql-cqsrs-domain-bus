import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { UserProvisioning } from '../../application/user/user-provisioning.service';
import type { User } from '../../domain/user/user.entity';
import { CredentialId } from '../../domain/user/vo/credential-id';
import { SessionUserPipe } from './session-user.pipe';

/**
 * A tradução sessão → perfil de domínio.
 *
 * O `UserProvisioning` entra como dublê porque o que este pipe faz é **só** repassar: o que interessa
 * aqui é o que ele extrai da sessão — o **id da credencial**, e não mais o email e o papel — e o
 * `await` que a entrada exige.
 */
describe('SessionUserPipe', () => {
  const profile = { id: 'quem-quer-que-seja' } as unknown as User;
  let asked: CredentialId[];
  let pipe: SessionUserPipe;

  beforeEach(() => {
    asked = [];
    const provisioning = {
      provision: async (credentialId: CredentialId) => {
        asked.push(credentialId);
        return profile;
      },
    } as unknown as UserProvisioning;
    pipe = new SessionUserPipe(provisioning);
  });

  const sessionFor = (user: object) => ({ user }) as unknown as UserSession;

  /**
   * O que mudou com o provisionamento no hook: a borda pergunta *de quem é esta credencial*, e não
   * mais *crie um perfil para este email*. Email, nome e papel deixaram de atravessar o pipe — quem
   * os lê é o provedor de identidade, do outro lado da porta.
   */
  it('provisiona o perfil pelo id da credencial da sessão', async () => {
    // Arrange
    const session = sessionFor({ id: 'cred-1', email: 'manuel@example.com', name: 'manuel' });

    // Act
    const user = await pipe.transform(session);

    // Assert
    expect(user).toBe(profile);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeInstanceOf(CredentialId);
    expect(asked[0].value).toBe('cred-1');
  });

  /**
   * A pegadinha que o e2e pegou: a factory do `@Session()` é `async`, e o Nest **não** a resolve antes
   * de aplicar os pipes — o primeiro da cadeia recebe a Promise. Sem este `await`, `session.user` é
   * `undefined` e o erro só aparece em runtime, num resolver de verdade.
   */
  it('aceita a sessão ainda como Promise, que é como o Nest a entrega ao primeiro pipe', async () => {
    // Arrange
    const session = Promise.resolve(sessionFor({ id: 'cred-2', email: 'manuel@example.com' }));

    // Act
    const user = await pipe.transform(session);

    // Assert
    expect(user).toBe(profile);
    expect(asked[0].value).toBe('cred-2');
  });
});
