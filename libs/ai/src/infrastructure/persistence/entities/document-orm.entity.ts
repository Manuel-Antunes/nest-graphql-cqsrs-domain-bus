import { defineEntity } from 'mikro-orm-neo4j';

/**
 * `:Document` — the root of the lexical graph. One node per indexed source text; its chunks
 * hang off it by `PART_OF`, declared on the owning side in {@link ChunkNodeSchema}.
 *
 * MikroORM owns this node outright. No LangChain code path touches `:Document`, so unlike
 * `:Chunk` there is no shared-property hazard here — every property below may be written and
 * read freely through the `'neo4j'` context.
 *
 * It deliberately mirrors no business properties. Per the change's D6 the graph exists to
 * decide *which* ids come back; *what* they are is re-read from PostgreSQL by id. A
 * `:Document` is a lexical anchor, not a projection — the entities its text mentions are
 * reachable through `(:Chunk)-[:HAS_ENTITY]->(…)`.
 */
export const DocumentNodeSchema = defineEntity({
  name: 'DocumentNode',
  // `tableName` IS the primary Cypher label, and omitting it is a silent bug rather than a
  // default: `Neo4jCypherUtils.getNodeLabels` is `Set([meta.collection ?? meta.className,
  // ...meta.labels])`, and `meta.collection` is MikroORM's naming-strategy output, i.e.
  // snake_case. Without this line the label would be `:document_node`.
  tableName: 'Document',
  // Serves `MATCH (n:Document { id, tenant })`, which is every read of this node — `tenant`
  // because it is the graph's only isolation control (Neo4j Community has no schemas and no
  // multi-database), `id` because it is the federation key. Without it the match plans as
  // `NodeByLabelScan`. Provisioned by `orm.schema.ensureIndexes()`.
  //
  // The order is NOT load-bearing, and specifically does not buy a leading-prefix seek: measured
  // against 2k nodes with real statistics, `MATCH (n:X { tenant })` alone still plans as
  // `NodeByLabelScan`. Only a query supplying BOTH properties seeks — which every query here
  // does, by D7. Pinned by the `EXPLAIN` assertions in `lexical-graph-indexes.spec.ts`.
  indexes: [{ properties: ['tenant', 'id'] }],
  properties(properties) {
    return {
      id: properties.uuid().primary(),
      // The graph's ONLY tenant isolation: Neo4j Community has no RLS, and every hot read is
      // raw Cypher (D5), which ignores ORM filters. Callers must carry an explicit `tenant`
      // predicate in every query.
      tenant: properties.string().primary(),
    };
  },
});
