import type { Embeddings } from '@langchain/core/embeddings';
import { FactoryProvider, Logger } from '@nestjs/common';

import neo4jConfig, { type Neo4jConfig } from '../config/neo4j.config';
import { ModernNeo4jVectorStore } from '../vectorstores/modern-neo4j-vector.store';

export const VectorStoreFactory = {
  provide: 'VECTOR_STORE',
  async useFactory(embeddings: Embeddings, neo4jConfig: Neo4jConfig) {
    const logger = new Logger('VectorStoreFactory');
    const config = {
      url: neo4jConfig.NEO4J_URI,
      username: neo4jConfig.NEO4J_USER,
      password: neo4jConfig.NEO4J_PASSWORD,
      database: neo4jConfig.NEO4J_DATABASE,
      indexName: 'agent_index',
      searchType: 'hybrid' as const,
      textNodeProperties: ['question'],
      nodeLabel: 'Chunk',
    };

    try {
      return await ModernNeo4jVectorStore.fromExistingGraph(embeddings, config);
    } catch (error) {
      // Initializing the store probes the embedding dimension (one embeddings
      // call) and opens Neo4j — either can fail when the embeddings provider has
      // no key (local dev) or Neo4j is unreachable. That must NOT crash the whole
      // process at boot: the app still serves everything that doesn't need RAG.
      // Return a DEGRADED store whose methods return safe defaults (empty results
      // / no-ops) and never throw, so neither boot nor any later call crashes the
      // process. Restart with embeddings + Neo4j available to enable RAG.
      logger.error(
        'Vector store initialization failed (embeddings/Neo4j unavailable); RAG features degraded (searches return empty, writes are no-ops).',
        error instanceof Error ? error.stack : String(error),
      );
      const emptyRetriever = {
        // Both the legacy and LCEL retriever entry points return no documents.
        getRelevantDocuments: async () => [],
        invoke: async () => [],
        _getRelevantDocuments: async () => [],
      };
      const degraded = {
        embeddings,
        async similaritySearch() {
          return [];
        },
        async similaritySearchWithScore() {
          return [];
        },
        async similaritySearchVectorWithScore() {
          return [];
        },
        async maxMarginalRelevanceSearch() {
          return [];
        },
        async addDocuments() {
          return [];
        },
        async addVectors() {
          return undefined;
        },
        async insert() {
          return undefined;
        },
        async delete() {
          return undefined;
        },
        asRetriever() {
          return emptyRetriever;
        },
      };
      return degraded as unknown as ModernNeo4jVectorStore;
    }
  },
  inject: ['EMBEDDING_MODEL', neo4jConfig.KEY],
} satisfies FactoryProvider;
