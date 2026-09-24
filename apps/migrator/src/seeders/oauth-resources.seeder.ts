import type { EntityManager } from '@mikro-orm/postgresql';
import { Seeder } from '@mikro-orm/seeder';
import type { AuthConfig } from '@nestposts/auth/infrastructure/better-auth/config';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import {
  BETTER_AUTH,
  BETTER_AUTH_CONFIG,
} from '@nestposts/auth/infrastructure/better-auth/tokens';
import { inRequestContext } from '@nestposts/database';

import { seederContainer } from './container';

const OAUTH_RESOURCE_MODEL = 'oauthResource';

export class OAuthResourcesSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const container = seederContainer();
    const auth = container.get<BetterAuth>(BETTER_AUTH);
    const config = container.get<AuthConfig>(BETTER_AUTH_CONFIG);

    await inRequestContext(em, async () => {
      const { adapter } = await auth.$context;
      for (const identifier of config.oauthResources) {
        const existing = await adapter.findOne({
          model: OAUTH_RESOURCE_MODEL,
          where: [{ field: 'identifier', value: identifier }],
        });
        if (existing) continue;
        const now = new Date();
        await adapter.create({
          model: OAUTH_RESOURCE_MODEL,
          data: {
            identifier,
            name: new URL(identifier).host,
            disabled: false,
            dpopBoundAccessTokensRequired: false,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    });
  }
}
