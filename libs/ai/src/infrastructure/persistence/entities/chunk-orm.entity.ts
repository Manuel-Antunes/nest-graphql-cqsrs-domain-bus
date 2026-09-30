import { defineEntity, neo4j } from 'mikro-orm-neo4j';

import { DocumentNodeSchema } from './document-orm.entity';

/**
 * `:Chunk` — a slice of a {@link DocumentNodeSchema}'s text.
 *
 * ## This node has two writers, and they must not overlap
 *
 * `neo4j-driver` resolves twice in this workspace — `5.28.3` nested under `mikro-orm-neo4j`,
 * `6.1.0` hoisted for `@langchain/community` — so `instanceof` across the two realms is
 * always false and no driver-owned value (`Integer`, `Node`, temporal types, the embedding
 * vector) may be handed from one side to the other. The change's D4 dissolves that by
 * splitting the node itself rather than aligning the versions:
 *
 * | Writer                       | Properties                                     |
 * |------------------------------|------------------------------------------------|
 * | LangChain (`VECTOR_STORE`)   | `text`, `embedding` (+ flattened doc metadata) |
 * | MikroORM (`'neo4j'` context) | everything declared below, and `PART_OF`       |
 *
 * **`id` is the entire contract between them.** `ModernNeo4jVectorStore.addVectors` writes
 * `MERGE (c:Chunk {id: row.id}) SET c.embedding = …, c.text = …, c += row.metadata`, so a
 * plain string id is the only value the two realms ever exchange, and they exchange it
 * *through the graph* rather than in process.
 *
 * ## Why `text` and `embedding` are absent below
 *
 * They are on the node; they are simply not this side's to touch. Mapping them would break
 * the split in two concrete ways:
 *
 *  1. `Neo4jDriver.nativeUpdate` emits `MATCH … SET n.<prop> = $p` for every *mapped* property
 *     in the payload, so a `Chunk` flushed by MikroORM (e.g. just to attach `PART_OF`) would
 *     clobber LangChain's `text` with `null`. Leaving them unmapped makes that structurally
 *     impossible instead of merely discouraged.
 *  2. After the D8 fix (`textNodeProperties: ['text']`), `fromExistingGraph`'s boot backfill is
 *     `MATCH (n:Chunk) WHERE n.embedding IS null AND any(k IN ['text'] WHERE n[k] IS NOT null)`
 *     → embed → `SET n.embedding`. A MikroORM-written chunk carrying `text` but no embedding
 *     would therefore be silently embedded at the next boot of *any* runtime holding
 *     `VECTOR_STORE` — tenant-blind, unbounded, billed, and outside the indexing command.
 *     Not mapping `text` keeps MikroORM-only chunks invisible to that loop.
 *
 * Reading is safe: `transformResult` delegates to core's `mapResult`, which maps declared
 * properties and ignores the rest — so the extra node properties are tolerated, not owned.
 *
 * ## `HAS_ENTITY` is not declared here
 *
 * `(:Chunk)-[:HAS_ENTITY]->(legal projection node)` needs a concrete target schema, which
 * lives with the legal graph entities. It is added there, not here.
 */
export const ChunkNodeSchema = defineEntity({
  name: 'ChunkNode',
  // MUST be exactly `Chunk`, and for a load-bearing reason: this is the primary Cypher label
  // (`getNodeLabels` = `Set([meta.collection ?? meta.className, ...meta.labels])`, and
  // `meta.collection` is the naming strategy's snake_case output). The existing vector index
  // is `agent_index VECTOR FOR (n:Chunk) ON (n.embedding)`. Drop this line and the label
  // becomes `:chunk_node`, which that index does not cover — reusing the index is the whole
  // point, so reusing the label is not optional.
  tableName: 'Chunk',
  // As on `:Document`, and load-bearing for the legal read model too: its `HAS_ENTITY` link
  // starts at `MATCH (c:Chunk { id, tenant })`. `agent_index` does not serve that — a vector
  // index answers similarity, not a property lookup — so without this the match is a label scan.
  indexes: [{ properties: ['tenant', 'id'] }],
  properties(properties) {
    return {
      // Client-generated and shared verbatim with the vector store — see the docblock. Never
      // let this side allocate an id the LangChain side has not been told about, or the
      // `MERGE (c:Chunk {id})` lands on a different node.
      id: properties.uuid().primary(),
      // As on `:Document`: the graph's only tenant isolation, and raw Cypher (D5) bypasses ORM
      // filters, so every query needs an explicit `tenant` predicate.
      tenant: properties.string().primary(),
      // (:Chunk)-[:PART_OF]->(:Document). `direction` is relative to the entity declaring the
      // property, so the owning many-to-one side is `OUT`. Only the owning side is declared:
      // `em.find(ChunkNodeSchema, { document })` covers the inverse, and a second file
      // referencing this one back would make the pair circular for no gain — the same reason
      // `JudgmentCreditorSchema` declares no `heirs` against `HeirSchema.judgmentCreditor`.
      document: () =>
        neo4j(properties.manyToOne(DocumentNodeSchema).ref(), {
          type: 'PART_OF',
          direction: 'OUT',
        }),
    };
  },
});
