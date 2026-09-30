export * from './chunk-orm.entity';
export * from './document-orm.entity';

import { ChunkNodeSchema } from './chunk-orm.entity';
import { DocumentNodeSchema } from './document-orm.entity';

/**
 * The lexical-graph entities, for `GraphDatabaseModule.forFeature`. Sibling of
 * `CHECKPOINT_ENTITIES`, but on the `'neo4j'` context rather than `'pg'`.
 */
export const LEXICAL_GRAPH_ENTITIES = [DocumentNodeSchema, ChunkNodeSchema];
