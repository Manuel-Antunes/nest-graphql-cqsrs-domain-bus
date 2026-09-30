import { Injectable } from '@nestjs/common';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { TENANT_HEADER } from '@nestposts/database';

import { ChatwootAgentBotTokens } from './chatwoot-agent-bot-tokens';
import { DefaultSubgraphHeaderResolver } from './default-subgraph.header-resolver';
import { OrganizationSlugs } from './organization-slugs';
import type {
  SubgraphHeaderResolver,
  SubgraphHeaders,
} from './subgraph.header-resolver';

@Injectable()
export class ChatwootSubgraphHeaderResolver
  extends DefaultSubgraphHeaderResolver
  implements SubgraphHeaderResolver
{
  readonly subgraphName = 'chatwoot';

  constructor(
    organizations: OrganizationSlugs,
    private readonly agentBots: ChatwootAgentBotTokens,
  ) {
    super(organizations);
  }

  override async resolve(
    identity: Identity | null,
    req: unknown,
  ): Promise<SubgraphHeaders> {
    const headers = await super.resolve(identity, req);
    const accessToken = await this.agentBots.accessTokenFor(
      identity,
      headers[TENANT_HEADER],
    );
    if (!accessToken) return headers;
    return {
      ...Object.fromEntries(
        Object.entries(headers).filter(([name]) => name !== 'authorization'),
      ),
      [ChatwootAgentBotTokens.ACCESS_TOKEN_HEADER]: accessToken,
    };
  }
}
