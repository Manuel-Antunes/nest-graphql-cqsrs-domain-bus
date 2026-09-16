import { MikroORM } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { AfterCreate, AfterUpdate, DatabaseHook } from '@thallesp/nestjs-better-auth';
import { UserProvisioning } from '../../application/user/user-provisioning.service';
import { CredentialId } from '../../domain/user/vo/credential-id';
import { inRequestContext } from '../../infrastructure/persistence/request-context';

interface AuthUserRow {
  id: string;
}

@Injectable()
@DatabaseHook()
export class UserProvisioningHooks {
  private readonly logger = new Logger(UserProvisioningHooks.name);

  constructor(
    private readonly orm: MikroORM,
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

  private async provision(credentialId: string, because: string): Promise<void> {
    const parsed = CredentialId.safeParse(credentialId);
    if (!parsed.success) {
      this.logger.warn(`${because}: id de credencial inválido (${credentialId})`);
      return;
    }
    try {
      await inRequestContext(this.orm, () => this.provisioning.provision(parsed.data));
    } catch (error) {
      this.logger.error(`${because}: provisionamento adiado para a próxima requisição`, error);
    }
  }
}
