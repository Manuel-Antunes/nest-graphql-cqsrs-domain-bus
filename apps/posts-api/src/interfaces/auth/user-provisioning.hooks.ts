import { Injectable, Logger } from '@nestjs/common';
import {
  RequestContext,
  ROOT_TENANT,
  TenantEntityManagerService,
} from '@nestposts/database';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import {
  AfterCreate,
  AfterUpdate,
  DatabaseHook,
} from '@thallesp/nestjs-better-auth';

import { UserProvisioning } from '../../application/user/user-provisioning.service';

interface AuthUserRow {
  id: string;
}

@Injectable()
@DatabaseHook()
export class UserProvisioningHooks {
  private readonly logger = new Logger(UserProvisioningHooks.name);

  constructor(
    private readonly tenants: TenantEntityManagerService,
    private readonly provisioning: UserProvisioning,
  ) {}

  @AfterCreate('user')
  async onCredentialCreated(user: AuthUserRow): Promise<void> {
    await this.provision(user.id, 'credencial criada');
  }

  @AfterUpdate('user')
  async onCredentialUpdated(user: AuthUserRow): Promise<void> {
    await this.provision(user.id, 'credencial atualizada');
  }

  private async provision(userId: string, because: string): Promise<void> {
    const parsed = UserId.safeParse(userId);
    if (!parsed.success) {
      this.logger.warn(`${because}: id de credencial inválido (${userId})`);
      return;
    }
    try {
      const root =
        await this.tenants.createAndMigrateTenantEntityManager(ROOT_TENANT);
      await RequestContext.create(root, () =>
        this.provisioning.provision(parsed.data),
      );
    } catch (error) {
      this.logger.error(
        `${because}: provisionamento adiado para a próxima requisição`,
        error,
      );
    }
  }
}
