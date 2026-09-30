export * from './chunk-orm.entity';
export * from './document-orm.entity';

import { ChunkNodeSchema } from './chunk-orm.entity';
import { DocumentNodeSchema } from './document-orm.entity';

export const LEXICAL_GRAPH_CONTEXT = 'neo4j';

export const LEXICAL_GRAPH_ENTITIES = [DocumentNodeSchema, ChunkNodeSchema];
