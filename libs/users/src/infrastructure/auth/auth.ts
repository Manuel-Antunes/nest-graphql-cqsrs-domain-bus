import type { MikroORM } from '@mikro-orm/core';
import { mikroOrmAdapter } from 'better-auth-mikro-orm';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { admin, jwt } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { defineBetterAuthEntities } from './better-auth.schema';

export const AUTHOR_ROLE = 'author';

export const authOptions = {
  baseURL: process.env.AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  secret: process.env.AUTH_SECRET ?? 'nest-graphql-posts-dev-secret-nao-use-em-producao',
  user: { modelName: 'authUser' },
  emailAndPassword: { enabled: true },
  account: {
    accountLinking: { enabled: true, trustedProviders: ['credential'] },
  },
  databaseHooks: {},
  plugins: [
    jwt(),
    admin(),
    oauthProvider({
      loginPage: '/sign-in',
      consentPage: '/consent',
      scopes: ['openid', 'profile', 'email', 'offline_access', 'read:posts', 'write:posts'],
    }) as unknown as NonNullable<BetterAuthOptions['plugins']>[number],
  ],
} satisfies BetterAuthOptions;

export const betterAuthEntities = defineBetterAuthEntities(authOptions);

export function createAuth(orm: MikroORM) {
  return betterAuth({ ...authOptions, database: mikroOrmAdapter(orm) });
}

export type Auth = ReturnType<typeof createAuth>;
