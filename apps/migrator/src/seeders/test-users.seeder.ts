import type { EntityManager } from '@mikro-orm/postgresql';
import { Seeder } from '@mikro-orm/seeder';
import { AuthUser } from '@nestposts/auth/domain/auth/auth-user.entity';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { inRequestContext } from '@nestposts/database';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { Email } from '@nestposts/users/domain/user/vo/email';

import type { SeedConfig } from '../config/seed.config';
import { seedConfig } from '../config/seed.config';
import { seederContainer } from './container';

export class TestUsersSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const container = seederContainer();
    const auth = container.get<BetterAuth>(BETTER_AUTH);
    const identities = container.get(IdentityProvider);
    const { users } = container.get<SeedConfig>(seedConfig.KEY);

    for (const user of users) {
      const email = Email.parse(user.email);
      if (!(await em.findOne(AuthUser, { email }))) {
        const created = await inRequestContext(em, async () => {
          const { user: signedUp } = await auth.api.signUpEmail({
            body: {
              email: user.email,
              password: user.password,
              name: user.name,
            },
          });
          return signedUp;
        });
        if (user.author) {
          await identities.grantRole(
            CredentialId.parse(created.id),
            AUTHOR_ROLE,
          );
        }
      }
      await em.nativeUpdate(AuthUser, { email }, { emailVerified: true });
    }
  }
}
