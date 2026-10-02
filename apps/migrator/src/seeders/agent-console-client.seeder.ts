import type { EntityManager } from '@mikro-orm/postgresql';
import { Seeder } from '@mikro-orm/seeder';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { inRequestContext } from '@nestposts/database';

import { seederContainer } from './container';

export class AgentConsoleClientSeeder extends Seeder {
  static readonly CLIENT_ID = 'agent-console';
  static readonly REDIRECT_URI = 'http://127.0.0.1:8976/callback';
  static readonly SCOPES = [
    'openid',
    'profile',
    'email',
    'offline_access',
    'read:posts',
    'write:posts',
  ];

  private static readonly MODEL = 'oauthClient';

  async run(em: EntityManager): Promise<void> {
    const auth = seederContainer().get<BetterAuth>(BETTER_AUTH);

    await inRequestContext(em, async () => {
      const { adapter } = await auth.$context;
      const existing = await adapter.findOne({
        model: AgentConsoleClientSeeder.MODEL,
        where: [
          { field: 'clientId', value: AgentConsoleClientSeeder.CLIENT_ID },
        ],
      });
      if (existing) return;
      const now = new Date();
      await adapter.create({
        model: AgentConsoleClientSeeder.MODEL,
        data: {
          clientId: AgentConsoleClientSeeder.CLIENT_ID,
          name: 'Agent console',
          disabled: false,
          skipConsent: true,
          redirectUris: [AgentConsoleClientSeeder.REDIRECT_URI],
          scopes: AgentConsoleClientSeeder.SCOPES,
          grantTypes: ['authorization_code', 'refresh_token'],
          responseTypes: ['code'],
          tokenEndpointAuthMethod: 'none',
          applicationType: 'native',
          requirePKCE: true,
          createdAt: now,
          updatedAt: now,
        },
      });
    });
  }
}
