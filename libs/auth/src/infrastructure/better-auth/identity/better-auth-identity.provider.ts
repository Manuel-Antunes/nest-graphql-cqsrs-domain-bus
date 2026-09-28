import { MikroORM } from '@mikro-orm/core';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { BetterAuth } from '../init-auth';
import { BETTER_AUTH } from '../tokens';
import { AuthRoles } from './auth-roles';

interface AuthUserRow {
  id: string;
  role?: string | string[] | null;
}

@Injectable()
export class BetterAuthIdentityProvider extends IdentityProvider {
  private readonly logger = new Logger(BetterAuthIdentityProvider.name);

  constructor(
    @Inject(BETTER_AUTH) private readonly auth: BetterAuth,
    private readonly orm: MikroORM,
  ) {
    super();
  }

  async grantRole(userId: UserId, role: string): Promise<void> {
    this.logger.log(`granting the role ${role} to user ${userId}`);
    await this.onIdentityStore((adapter) =>
      adapter.updateUser(userId.value, { role }),
    );
  }

  addRole(userId: UserId, role: string): Promise<void> {
    this.logger.log(`adding the role ${role} to user ${userId}`);
    return this.changeRoles(userId, (stored) => AuthRoles.adding(stored, role));
  }

  removeRole(userId: UserId, role: string): Promise<void> {
    this.logger.log(`removing the role ${role} from user ${userId}`);
    return this.changeRoles(userId, (stored) =>
      AuthRoles.removing(stored, role),
    );
  }

  private async changeRoles(
    userId: UserId,
    change: (stored: AuthUserRow['role']) => string,
  ): Promise<void> {
    await this.onIdentityStore(async (adapter) => {
      const user = (await adapter.findUserById(
        userId.value,
      )) as AuthUserRow | null;
      if (!user) {
        throw new Error(`no user ${userId}`);
      }
      return adapter.updateUser(userId.value, { role: change(user.role) });
    });
  }

  private onIdentityStore(
    work: (adapter: any) => Promise<unknown>,
  ): Promise<unknown> {
    return inRequestContext(this.orm, async () => {
      const context = await this.auth.$context;
      return work(context.internalAdapter);
    });
  }
}
