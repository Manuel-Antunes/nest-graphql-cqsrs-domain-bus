import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { LEXICAL_GRAPH_CONTEXT, LEXICAL_GRAPH_ENTITIES } from './entities';

const graphEntities = MikroOrmModule.forFeature(
  { entities: [...LEXICAL_GRAPH_ENTITIES] },
  LEXICAL_GRAPH_CONTEXT,
);

@Module({
  imports: [graphEntities],
  exports: [graphEntities],
})
export class LexicalGraphModule {}
