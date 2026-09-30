import { GraphDatabaseModule } from '@acme/database/graph';
import { Module } from '@nestjs/common';

import { LEXICAL_GRAPH_ENTITIES } from './entities';

// `forFeature` is safe to evaluate statically, unlike `forRoot`: it only builds repository
// providers and records the entities in `MikroOrmEntitiesStorage` for `autoLoadEntities` to
// pick up. It is `forRoot` that pushes onto `CONTEXT_NAMES` and opens the Bolt connection,
// which is why `GraphDatabaseModule` keeps it out of its own decorator.
const graphEntities = GraphDatabaseModule.forFeature({
  entities: LEXICAL_GRAPH_ENTITIES,
});

/**
 * Registers `:Document` / `:Chunk` on the `'neo4j'` context.
 *
 * Import this from a module that has already called `GraphDatabaseModule.forRoot()` — the
 * `forFeature` below only declares entities against the context; it does not create it.
 *
 * Deliberately NOT imported by {@link CheckpointDatabaseModule}, and deliberately reachable
 * only through the `@acme/ai-checkpoint/graph` subpath rather than the package barrel. This
 * package exists so the migrator can declare the LangGraph checkpointer tables *without*
 * dragging the Neo4j/LLM graph into its bundle; putting these entities on the barrel would
 * pull `mikro-orm-neo4j` (and `neo4j-driver`) into `apps/migrator`, which sets
 * `IS_MIGRATOR=true` precisely to have nothing to do with the graph. Same split, and same
 * reason, as `@acme/database` vs. `@acme/database/graph`.
 */
@Module({
  imports: [graphEntities],
  exports: [graphEntities],
})
export class LexicalGraphModule {}
