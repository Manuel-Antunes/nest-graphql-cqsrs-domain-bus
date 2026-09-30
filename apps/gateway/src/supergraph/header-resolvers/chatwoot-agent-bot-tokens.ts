import type { Cache } from '@nestjs/cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { IdentityAttribute } from '@nestposts/auth/domain/auth/vo/identity-attribute';
import { MikroORM, ROOT_TENANT } from '@nestposts/database';
import { z } from 'zod';

import { OrganizationSlugs } from './organization-slugs';

interface AgentBotGrant {
  readonly agentBotId: string;
  readonly organizationId: string;
  readonly tokenId: string;
  readonly expiresAt: number;
}

@Injectable()
export class ChatwootAgentBotTokens {
  static readonly ACCESS_TOKEN_HEADER = 'api_access_token';
  static readonly CLIENT_ID_PREFIX = 'chatwoot-agent-bot-';
  static readonly SCOPE = 'write:conversations';
  static readonly AGENT_BOT_ID = IdentityAttribute.of(
    'agent_bot_id',
    z.coerce.number().int().positive(),
  );

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly organizations: OrganizationSlugs,
    private readonly orm: MikroORM,
  ) {}

  static keyOf(tokenId: string): string {
    return `chatwoot-agent-bot-token:${tokenId}`;
  }

  async accessTokenFor(
    identity: Identity | null,
    tenant: string | undefined,
  ): Promise<string | undefined> {
    const grant = identity && ChatwootAgentBotTokens.grantOf(identity);
    if (!grant || !(await this.admits(grant, tenant))) {
      return undefined;
    }
    const token = await this.cache.wrap(
      ChatwootAgentBotTokens.keyOf(grant.tokenId),
      () => this.lookup(grant),
      Math.max(1, grant.expiresAt - Date.now()),
    );
    return token ?? undefined;
  }

  private async admits(
    grant: AgentBotGrant,
    tenant: string | undefined,
  ): Promise<boolean> {
    if (!tenant || tenant === ROOT_TENANT) return true;
    return (await this.organizations.of(grant.organizationId)) === tenant;
  }

  private async lookup(grant: AgentBotGrant): Promise<string | null> {
    const [row] = await this.orm.em
      .getConnection()
      .execute<{ token: string }[]>(
        `select t.token from chatwoot.access_tokens t
           join chatwoot.agent_bots b on b.id = t.owner_id
           join chatwoot.accounts a on a.id = b.account_id
          where t.owner_type = 'AgentBot' and t.owner_id = ? and a.platform_organization_id = ?`,
        [grant.agentBotId, grant.organizationId],
      );
    return row?.token ?? null;
  }

  private static grantOf(identity: Identity): AgentBotGrant | undefined {
    const agentBotId = identity.attribute(ChatwootAgentBotTokens.AGENT_BOT_ID);
    const { credential, activeOrganizationId } = identity;
    if (
      identity.kind !== 'client' ||
      agentBotId === undefined ||
      identity.clientId !==
        `${ChatwootAgentBotTokens.CLIENT_ID_PREFIX}${agentBotId}` ||
      !identity.hasScopes([ChatwootAgentBotTokens.SCOPE]) ||
      !activeOrganizationId ||
      credential.type !== 'access-token'
    ) {
      return undefined;
    }
    return {
      agentBotId: String(agentBotId),
      organizationId: activeOrganizationId,
      tokenId: credential.tokenId,
      expiresAt: credential.expiresAt.getTime(),
    };
  }
}
