import { Module } from '@nestjs/common';
import { MikroORM } from '@nestposts/database';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';

import { ChatwootAgentBotTokens } from './chatwoot-agent-bot-tokens';
import { ChatwootSubgraphHeaderResolver } from './chatwoot-subgraph.header-resolver';
import { DefaultSubgraphHeaderResolver } from './default-subgraph.header-resolver';
import { OrganizationSlugs } from './organization-slugs';
import type { SubgraphHeaderResolver } from './subgraph.header-resolver';
import { SubgraphHeaderResolverFactory } from './subgraph-header-resolver.factory';

const subgraphHeaderResolvers = [ChatwootSubgraphHeaderResolver];

@Module({
  imports: [OrganizationsInfrastructureModule],
  providers: [
    OrganizationSlugs,
    ChatwootAgentBotTokens,
    DefaultSubgraphHeaderResolver,
    ...subgraphHeaderResolvers,
    {
      provide: SubgraphHeaderResolverFactory,
      inject: [
        MikroORM,
        DefaultSubgraphHeaderResolver,
        ...subgraphHeaderResolvers,
      ],
      useFactory: (
        orm: MikroORM,
        fallback: SubgraphHeaderResolver,
        ...resolvers: SubgraphHeaderResolver[]
      ) => new SubgraphHeaderResolverFactory(orm, fallback, resolvers),
    },
  ],
  exports: [SubgraphHeaderResolverFactory],
})
export class SubgraphHeaderResolverModule {}
