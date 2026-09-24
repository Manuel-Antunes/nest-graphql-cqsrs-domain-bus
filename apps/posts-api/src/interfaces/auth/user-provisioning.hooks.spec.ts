import type { Logger } from '@nestjs/common';
import type { TenantEntityManagerService } from '@nestposts/database';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';

import type { UserProvisioning } from '../../application/user/user-provisioning.service';
import { UserProvisioningHooks } from './user-provisioning.hooks';

describe('UserProvisioningHooks', () => {
  const profile = { id: 'perfil' } as unknown as User;
  let asked: CredentialId[];
  let tenantsAsked: string[];
  let fail: Error | null;
  let hooks: UserProvisioningHooks;

  beforeEach(() => {
    asked = [];
    tenantsAsked = [];
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
    const tenants = {
      createAndMigrateTenantEntityManager: async (tenantId: string) => {
        tenantsAsked.push(tenantId);
        return { fork: () => ({}) };
      },
    } as unknown as TenantEntityManagerService;
    hooks = new UserProvisioningHooks(tenants, provisioning);
  });

  it('o sign-up provisiona o perfil da credencial recém-criada', async () => {
    await hooks.onCredentialCreated({ id: 'cred-1' });

    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeInstanceOf(CredentialId);
    expect(asked[0].value).toBe('cred-1');
  });

  it('provisions in the root tenant, which is where a sign-up that names none belongs', async () => {
    await hooks.onCredentialCreated({ id: 'cred-1' });

    expect(tenantsAsked).toEqual(['root']);
  });

  it('a credencial atualizada volta para o provisionamento, que decide se promove', async () => {
    await hooks.onCredentialUpdated({ id: 'cred-2' });

    expect(asked[0].value).toBe('cred-2');
  });

  it('uma falha ao provisionar não derruba o que o provedor estava fazendo', async () => {
    fail = new Error('banco fora do ar');
    const error = vi
      .spyOn(
        (
          hooks as unknown as {
            logger: Logger;
          }
        ).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await expect(
      hooks.onCredentialCreated({ id: 'cred-3' }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('um id de credencial inválido é recusado na borda', async () => {
    const warn = vi
      .spyOn((hooks as unknown as { logger: Logger }).logger, 'warn')
      .mockImplementation(() => undefined);

    await hooks.onCredentialCreated({ id: '  ' });

    expect(asked).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
