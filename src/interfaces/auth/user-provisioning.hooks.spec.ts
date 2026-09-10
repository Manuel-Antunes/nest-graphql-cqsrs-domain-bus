import { MikroORM } from '@mikro-orm/core';
import type { UserProvisioning } from '../../application/user/user-provisioning.service';
import type { User } from '../../domain/user/user.entity';
import { CredentialId } from '../../domain/user/vo/credential-id';
import { UserProvisioningHooks } from './user-provisioning.hooks';

/**
 * A borda por onde o Better Auth chama para dentro.
 *
 * O `UserProvisioning` entra como dublê porque o que os ganchos fazem é **traduzir e proteger**: o id
 * cru da linha vira um `CredentialId`, e uma falha nossa não pode derrubar a autenticação dele. As
 * consequências de domínio (criar, ligar, promover) são do serviço, e têm o teste delas.
 *
 * O `MikroORM` é dublado porque o que importa aqui não é o contexto — `inRequestContext` reaproveita
 * o que já existir, e o teste chama o gancho direto, sem requisição nenhuma por baixo.
 */
describe('UserProvisioningHooks', () => {
  const profile = { id: 'perfil' } as unknown as User;
  let asked: CredentialId[];
  let fail: Error | null;
  let hooks: UserProvisioningHooks;

  beforeEach(() => {
    asked = [];
    fail = null;
    const provisioning = {
      provision: async (credentialId: CredentialId) => {
        asked.push(credentialId);
        if (fail) {
          throw fail;
        }
        return profile;
      },
    } as unknown as UserProvisioning;
    // Um ORM que nunca é tocado: o `inRequestContext` só pede o `em` quando não há contexto, e o
    // gancho aqui roda dentro do que o próprio helper abre.
    const orm = { em: { fork: () => ({}) } } as unknown as MikroORM;
    hooks = new UserProvisioningHooks(orm, provisioning);
  });

  it('o sign-up provisiona o perfil da credencial recém-criada', async () => {
    // Act
    await hooks.onCredentialCreated({ id: 'cred-1' });

    // Assert
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeInstanceOf(CredentialId);
    expect(asked[0].value).toBe('cred-1');
  });

  it('a credencial atualizada volta para o provisionamento, que decide se promove', async () => {
    // Act
    await hooks.onCredentialUpdated({ id: 'cred-2' });

    // Assert
    expect(asked[0].value).toBe('cred-2');
  });

  /**
   * A regra que sustenta o desenho: autenticar é do provedor, provisionar é nosso. Se o nosso lado
   * falha, o sign-up **não** pode falhar junto — a próxima requisição refaz o trabalho pelo
   * `SessionUserPipe`, que chama o mesmo método idempotente.
   */
  it('uma falha ao provisionar não derruba o que o provedor estava fazendo', async () => {
    // Arrange
    fail = new Error('banco fora do ar');
    const error = vi.spyOn((hooks as any).logger, 'error').mockImplementation(() => undefined);

    // Act / Assert
    await expect(hooks.onCredentialCreated({ id: 'cred-3' })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  /** Um id que não é um id não vira um `CredentialId` — e não chega ao serviço. */
  it('um id de credencial inválido é recusado na borda', async () => {
    // Arrange
    const warn = vi.spyOn((hooks as any).logger, 'warn').mockImplementation(() => undefined);

    // Act
    await hooks.onCredentialCreated({ id: '  ' });

    // Assert
    expect(asked).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
