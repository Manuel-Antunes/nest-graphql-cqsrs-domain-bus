import { MikroORM } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { inRequestContext } from '../persistence/request-context';
import { type Identity, IdentityProvider } from '../../domain/user/identity.provider';
import { Email } from '../../domain/user/vo/email';
import { CredentialId } from '../../domain/user/vo/credential-id';
import { UserName } from '../../domain/user/vo/user-name';

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
    private readonly auth: AuthService,
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
    this.logger.log(`concedendo o papel ${role} à credencial ${credentialId}`);
    const updated = await this.onIdentityStore<AuthUserRow>((adapter) =>
      adapter.updateUser(credentialId.value, { role }),
    );
    return BetterAuthIdentityProvider.toIdentity(updated);
  }

  private onIdentityStore<T>(work: (adapter: any) => Promise<unknown>): Promise<T> {
    return inRequestContext(this.orm, async () => {
      const context = await (this.auth.instance as { $context: Promise<any> }).$context;
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
