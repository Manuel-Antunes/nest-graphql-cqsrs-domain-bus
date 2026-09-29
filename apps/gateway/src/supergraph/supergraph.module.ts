import { Module } from '@nestjs/common';

import type { AppConfig } from '../config/app.config';
import { appConfig } from '../config/app.config';
import { Supergraph } from './supergraph';
import { SupergraphSchemaController } from './supergraph-schema.controller';

@Module({
  providers: [
    {
      provide: Supergraph,
      inject: [appConfig.KEY],
      useFactory: ({ subgraphs }: AppConfig) => new Supergraph(subgraphs),
    },
  ],
  controllers: [SupergraphSchemaController],
  exports: [Supergraph],
})
export class SupergraphModule {}
