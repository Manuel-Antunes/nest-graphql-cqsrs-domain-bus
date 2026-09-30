import { DatabaseModule } from '@acme/database';
import { Module } from '@nestjs/common';

import { CHECKPOINT_ENTITIES } from './checkpoint-orm.entities';

/**
 * Registers the LangGraph checkpointer tables with the ORM's schema diff.
 *
 * This lives in its own package (`@acme/ai-checkpoint`) rather than in `@acme/ai` so the
 * migrator can declare the tables without dragging the LLM/Neo4j/Langfuse factory graph
 * that `AiModule` wires up into its bundle. The only dependency is `@acme/database`.
 *
 * It provides nothing at runtime — `PostgresSaver` owns every query against these tables,
 * so in practice the migrator is the only consumer. See {@link CHECKPOINT_ENTITIES} for
 * why they are declared at all.
 */
@Module({
  imports: [
    DatabaseModule.forFeature({
      contextName: 'pg',
      entities: CHECKPOINT_ENTITIES,
    }),
  ],
})
export class CheckpointDatabaseModule {}
