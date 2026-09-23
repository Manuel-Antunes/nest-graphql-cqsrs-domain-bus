import type { Identity } from '@nestposts/users/domain/user/identity.provider';
import { MikroORM } from '@mikro-orm/core';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';

import type { BetterAuth } from '../init-auth';
import { BETTER_AUTH } from '../tokens';

interface AuthUserRow {
  id: string;
  email: string;
  name: string;
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

  async findById(credentialId: CredentialId): Promise<Identity | null> {
    const user = await this.onIdentityStore<AuthUserRow | null>((adapter) =>
      adapter.findUserById(credentialId.value),
    );
    return user ? BetterAuthIdentityProvider.toIdentity(user) : null;
  }

  async grantRole(credentialId: CredentialId, role: string): Promise<Identity> {
    this.logger.log(`granting the role ${role} to credential ${credentialId}`);
    const updated = await this.onIdentityStore<AuthUserRow>((adapter) =>
      adapter.updateUser(credentialId.value, { role }),
    );
    return BetterAuthIdentityProvider.toIdentity(updated);
  }

  private onIdentityStore<T>(
    work: (adapter: any) => Promise<unknown>,
  ): Promise<T> {
    return inRequestContext(this.orm, async () => {
      const context = await this.auth.$context;
      return (await work(context.internalAdapter)) as T;
    });
  }

  private static toIdentity(user: AuthUserRow): Identity {
    return {
      credentialId: CredentialId.parse(user.id),
      email: Email.parse(user.email),
      name: UserName.parse(user.name),
      role: BetterAuthIdentityProvider.firstRole(user.role),
    };
  }

  private static firstRole(role: AuthUserRow['role']): string | null {
    if (Array.isArray(role)) {
      return role[0] ?? null;
    }
    return role ?? null;
  }
}
