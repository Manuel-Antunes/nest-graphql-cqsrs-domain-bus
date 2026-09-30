import { Neo4jVectorStore } from '@langchain/community/vectorstores/neo4j_vector';
import type { Document } from '@langchain/core/documents';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { randomUUID } from 'node:crypto';

interface Neo4jVectorStoreArgs {
  url: string;
  username: string;
  password: string;
  database?: string;
  preDeleteCollection?: boolean;
  textNodeProperty?: string;
  textNodeProperties?: string[];
  embeddingNodeProperty?: string;
  keywordIndexName?: string;
  indexName?: string;
  searchType?: 'vector' | 'hybrid';
  indexType?: 'NODE' | 'RELATIONSHIP';
  retrievalQuery?: string;
  nodeLabel?: string;
  createIdIndex?: boolean;
}

// langchain marks these fields `private` but they are plain JS props at
// runtime. Cast through this shape to read/write them from the subclass
// without scattering `as any` everywhere.
type InternalState = {
  driver: unknown;
  database: string;
  preDeleteCollection: boolean;
  nodeLabel: string;
  embeddingNodeProperty: string;
  embeddingDimension: number;
  textNodeProperty: string;
  keywordIndexName: string;
  indexName: string;
  retrievalQuery: string;
  searchType: 'vector' | 'hybrid';
  indexType: 'NODE' | 'RELATIONSHIP';
  distanceStrategy: 'cosine' | 'euclidean';
  supportMetadataFilter: boolean;
  isEnterprise: boolean;
  _initializeDriver: (config: Neo4jVectorStoreArgs) => Promise<void>;
  _verifyConnectivity: () => Promise<void>;
  _dropIndex: () => Promise<void>;
};

const DEFAULT_NODE_EMBEDDING_PROPERTY = 'embedding';
const DEFAULT_SEARCH_TYPE = 'vector';
const DEFAULT_INDEX_TYPE: 'NODE' | 'RELATIONSHIP' = 'NODE';

/**
 * Drop-in replacement for `Neo4jVectorStore` that uses Cypher syntax
 * compatible with Neo4j 5.13+. Upstream still relies on
 * `db.index.vector.createNodeIndex` and `db.create.setVectorProperty`, both
 * removed in Neo4j 5.18.
 *
 * Each override first attempts the modern implementation. If it fails, the
 * inherited (legacy) implementation runs as a fallback so older Neo4j
 * versions keep working. If both paths fail the modern error is rethrown so
 * the actual feedback isn't masked by procedure-not-found noise.
 */
export class ModernNeo4jVectorStore extends Neo4jVectorStore {
  static override async initialize(
    embeddings: EmbeddingsInterface,
    config: Neo4jVectorStoreArgs,
  ): Promise<ModernNeo4jVectorStore> {
    // Parent's `initialize` hardcodes `new Neo4jVectorStore(...)`, which
    // would leak the wrong concrete type. Replicate the setup with `new
    // this(...)` so subclass dispatch keeps working through the chain.
    const store = new this(embeddings, config) as ModernNeo4jVectorStore;
    const internal = store as unknown as InternalState;
    await internal._initializeDriver(config);
    await internal._verifyConnectivity();
    const {
      preDeleteCollection = false,
      nodeLabel = 'Chunk',
      textNodeProperty = 'text',
      embeddingNodeProperty = DEFAULT_NODE_EMBEDDING_PROPERTY,
      keywordIndexName = 'keyword',
      indexName = 'vector',
      retrievalQuery = '',
      searchType = DEFAULT_SEARCH_TYPE,
      indexType = DEFAULT_INDEX_TYPE,
    } = config;
    internal.embeddingDimension = (await embeddings.embedQuery('foo')).length;
    internal.preDeleteCollection = preDeleteCollection;
    internal.nodeLabel = nodeLabel;
    internal.textNodeProperty = textNodeProperty;
    internal.embeddingNodeProperty = embeddingNodeProperty;
    internal.keywordIndexName = keywordIndexName;
    internal.indexName = indexName;
    internal.retrievalQuery = retrievalQuery;
    internal.searchType = searchType;
    internal.indexType = indexType;
    if (preDeleteCollection) await internal._dropIndex();
    return store;
  }

  override async createNewIndex(): Promise<void> {
    const internal = this as unknown as InternalState;
    let modernError: unknown;
    try {
      // Index name + label can't be parameterized in DDL; backtick-escape.
      await this.query(`
        CREATE VECTOR INDEX \`${internal.indexName}\` IF NOT EXISTS
        FOR (n:\`${internal.nodeLabel}\`) ON (n.\`${internal.embeddingNodeProperty}\`)
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: ${Number(internal.embeddingDimension)},
            \`vector.similarity_function\`: '${internal.distanceStrategy}'
          }
        }
      `);
      return;
    } catch (error) {
      modernError = error;
    }
    try {
      await super.createNewIndex();
      return;
    } catch {
      throw modernError;
    }
  }

  override async addVectors(
    vectors: number[][],
    documents: Document[],
    metadatas?: Record<string, unknown>[],
    ids?: string[],
  ): Promise<string[]> {
    const internal = this as unknown as InternalState;
    // Generate ids up front so the modern + legacy paths agree on identity
    // (the legacy `MERGE (c {id: row.id})` is idempotent — re-running after
    // a partial modern write is safe).
    const _ids = ids ?? documents.map(() => randomUUID());
    let modernError: unknown;
    try {
      const importQuery = `
        UNWIND $data AS row
        CALL {
          WITH row
          MERGE (c:\`${internal.nodeLabel}\` {id: row.id})
          SET c.\`${internal.embeddingNodeProperty}\` = row.embedding
          SET c.\`${internal.textNodeProperty}\` = row.text
          SET c += row.metadata
        } IN TRANSACTIONS OF 1000 ROWS
      `;
      const parameters = {
        data: documents.map(({ pageContent, metadata }, index) => ({
          text: pageContent,
          metadata: metadatas ? metadatas[index] : metadata,
          embedding: vectors[index],
          id: _ids[index],
        })),
      };
      await this.query(importQuery, parameters);
      return _ids;
    } catch (error) {
      modernError = error;
    }
    try {
      return await super.addVectors(vectors, documents, metadatas, _ids);
    } catch {
      throw modernError;
    }
  }

  static override async fromExistingGraph(
    embeddings: EmbeddingsInterface,
    config: Neo4jVectorStoreArgs,
  ): Promise<ModernNeo4jVectorStore> {
    let modernError: unknown;
    try {
      return await this.fromExistingGraphModern(embeddings, config);
    } catch (error) {
      modernError = error;
    }
    try {
      // `this === ModernNeo4jVectorStore` here, so the parent's static body
      // resolves `this.initialize` / `store.createNewIndex` to our overrides
      // — but its inline backfill still uses the deprecated procedure, which
      // is the legacy code path the user wants as fallback.
      return (await super.fromExistingGraph(
        embeddings,
        config,
      )) as ModernNeo4jVectorStore;
    } catch {
      throw modernError;
    }
  }

  private static async fromExistingGraphModern(
    embeddings: EmbeddingsInterface,
    config: Neo4jVectorStoreArgs,
  ): Promise<ModernNeo4jVectorStore> {
    const {
      textNodeProperties = [],
      embeddingNodeProperty = DEFAULT_NODE_EMBEDDING_PROPERTY,
      searchType = DEFAULT_SEARCH_TYPE,
      retrievalQuery = '',
      nodeLabel,
    } = config;
    if (textNodeProperties.length === 0) {
      throw new Error(
        'Parameter `text_node_properties` must not be an empty array',
      );
    }
    const _retrievalQuery =
      retrievalQuery ||
      `
      RETURN reduce(str='', k IN ${JSON.stringify(textNodeProperties)} |
      str + '\\n' + k + ': ' + coalesce(node[k], '')) AS text,
      node {.*, \`${embeddingNodeProperty}\`: Null, id: Null, ${textNodeProperties
        .map((p) => `\`${p}\`: Null`)
        .join(', ')} } AS metadata, score
    `;
    const store = await this.initialize(embeddings, {
      ...config,
      retrievalQuery: _retrievalQuery,
    });
    const internal = store as unknown as InternalState;
    const existingDim = await store.retrieveExistingIndex();
    if (!existingDim) {
      await store.createNewIndex();
    } else if (internal.embeddingDimension !== existingDim) {
      throw new Error(
        `Index with name ${internal.indexName} already exists. The provided embedding function and vector index dimensions do not match.\nEmbedding function dimension: ${internal.embeddingDimension}\nVector index dimension: ${existingDim}`,
      );
    }
    if (searchType === 'hybrid') {
      const ftsNodeLabel = await store.retrieveExistingFtsIndex(
        textNodeProperties,
      );
      if (!ftsNodeLabel) {
        await store.createNewKeywordIndex(textNodeProperties);
      } else if (ftsNodeLabel !== internal.nodeLabel) {
        throw new Error(
          "Vector and keyword index don't index the same node label",
        );
      }
    }
    while (true) {
      const fetchQuery = `
        MATCH (n:\`${nodeLabel}\`)
        WHERE n.\`${embeddingNodeProperty}\` IS null
        AND any(k in $props WHERE n[k] IS NOT null)
        RETURN elementId(n) AS id, reduce(str='', k IN $props |
        str + '\\n' + k + ':' + coalesce(n[k], '')) AS text
        LIMIT 1000
      `;
      const data = (await store.query(fetchQuery, {
        props: textNodeProperties,
      })) as Array<{ id: string; text: string }>;
      if (!data || data.length === 0) break;
      const textEmbeddings = await embeddings.embedDocuments(
        data.map((el) => el.text),
      );
      const backfillQuery = `
        UNWIND $data AS row
        MATCH (n:\`${nodeLabel}\`)
        WHERE elementId(n) = row.id
        SET n.\`${embeddingNodeProperty}\` = row.embedding
        RETURN count(*)
      `;
      await store.query(backfillQuery, {
        data: data.map((el, idx) => ({
          id: el.id,
          embedding: textEmbeddings[idx],
        })),
      });
      if (data.length < 1000) break;
    }
    return store;
  }
}
