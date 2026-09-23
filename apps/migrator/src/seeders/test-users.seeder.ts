import type { EntityManager } from '@mikro-orm/postgresql';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { Seeder } from '@mikro-orm/seeder';
import { AuthUser } from '@nestposts/auth/domain/auth/auth-user.entity';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { inRequestContext } from '@nestposts/database';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { Email } from '@nestposts/users/domain/user/vo/email';

import { seederContainer } from './container';

export interface SeededUser {
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly author: boolean;
}

const fromEnvironment = (prefix: string, fallback: SeededUser): SeededUser => ({
  email: process.env[`${prefix}_EMAIL`] ?? fallback.email,
  name: process.env[`${prefix}_NAME`] ?? fallback.name,
  password: process.env[`${prefix}_PASSWORD`] ?? fallback.password,
  author: fallback.author,
});

export const SEED_PASSWORD = 'segredo123';

export const seededUsers = (): SeededUser[] => [
  fromEnvironment('SEED_AUTHOR', {
    email: 'manuel@example.com',
    name: 'Manuel',
    password: SEED_PASSWORD,
    author: true,
  }),
  fromEnvironment('SEED_PROMOTED', {
    email: 'promovido@example.com',
    name: 'Promovido',
    password: SEED_PASSWORD,
    author: true,
  }),
  fromEnvironment('SEED_READER', {
    email: 'leitor@example.com',
    name: 'Leitor',
    password: SEED_PASSWORD,
    author: false,
  }),
];

export class TestUsersSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const container = seederContainer();
    const auth = container.get<BetterAuth>(BETTER_AUTH);
    const identities = container.get(IdentityProvider);

    for (const user of seededUsers()) {
      if (await em.findOne(AuthUser, { email: Email.parse(user.email) })) {
        continue;
      }
      const created = await inRequestContext(em, async () => {
        const { user: signedUp } = await auth.api.signUpEmail({
          body: { email: user.email, password: user.password, name: user.name },
        });
        return signedUp;
      });
      if (user.author) {
        await identities.grantRole(CredentialId.parse(created.id), AUTHOR_ROLE);
      }
    }
  }
}
