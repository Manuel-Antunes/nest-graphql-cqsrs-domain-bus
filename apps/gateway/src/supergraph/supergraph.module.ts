import { Module } from '@nestjs/common';

import type { AppConfig } from '../config/app.config';
import { appConfig } from '../config/app.config';
import { SubgraphHeaderResolverModule } from './header-resolvers/subgraph-header-resolvers.module';
import { Supergraph } from './supergraph';
import { SupergraphSchemaController } from './supergraph-schema.controller';

@Module({
  imports: [SubgraphHeaderResolverModule],
  providers: [
    {
      provide: Supergraph,
      inject: [appConfig.KEY],
      useFactory: ({ subgraphs }: AppConfig) => new Supergraph(subgraphs),
    },
  ],
  controllers: [SupergraphSchemaController],
  exports: [Supergraph, SubgraphHeaderResolverModule],
})
export class SupergraphModule {}
