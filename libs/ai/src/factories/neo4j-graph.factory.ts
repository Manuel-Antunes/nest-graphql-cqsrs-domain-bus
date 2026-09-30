import { Neo4jGraph } from '@langchain/community/graphs/neo4j_graph';
import {
  FactoryProvider,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';

import neo4jConfig, { Neo4jConfig } from '../config/neo4j.config';

class ExtendedNeo4jGraph extends Neo4jGraph implements OnApplicationBootstrap {
  private readonly logger = new Logger(Neo4jGraphFactory.provide);
  private initialized = false;
  MAX_RETRIES = 5;
  RETRY_INTERVAL = 1000;
  async onApplicationBootstrap() {
    const isMigrator = process.env['IS_MIGRATOR'] === 'true';
    if (isMigrator) {
      this.logger.log('Skipping Neo4jGraph initialization (Migrator mode)');
      return;
    }
    this.logger.log('Initializing Neo4jGraph...');
    try {
      await this.init();
    } catch (error) {
      // An unreachable Neo4j must NOT crash the whole process at boot — a
      // queue runner / API still serves everything that doesn't touch the
      // graph. Log and continue; the driver reconnects lazily on next use.
      this.logger.error(
        'Neo4jGraph initialization failed; continuing without graph features (will reconnect on demand).',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async init() {
    const maxRetries = this.MAX_RETRIES;
    let currentTest = 1;
    do {
      try {
        if (this.initialized) {
          return this;
        }
        await this.verifyConnectivity();
        try {
          await this.refreshSchema();
          this.initialized = true;
        } catch (error) {
          if (
            (
              error as {
                code: unknown;
              }
            ).code === 'Neo.ClientError.Procedure.ProcedureNotFound'
          )
            throw new Error(
              "Could not use APOC procedures. Please ensure the APOC plugin is installed in Neo4j and that 'apoc.meta.data()' is allowed in Neo4j configuration.",
            );
          throw error;
        } finally {
          this.logger.log('Schema refreshed successfully.');
        }
        return this;
      } catch (error) {
        this.logger.error('Neo4jGraph initialization failed.', error);
        currentTest++;
        if (currentTest > maxRetries) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, this.RETRY_INTERVAL),
        );
      }
    } while (currentTest < maxRetries);
    return this;
  }
}

export const Neo4jGraphFactory = {
  provide: 'NEO4J_GRAPH',
  async useFactory(neo4jConfig: Neo4jConfig): Promise<Neo4jGraph> {
    return new ExtendedNeo4jGraph({
      password: neo4jConfig.NEO4J_PASSWORD,
      url: neo4jConfig.NEO4J_URI,
      database: neo4jConfig.NEO4J_DATABASE,
      username: neo4jConfig.NEO4J_USER,
      enhancedSchema: false,
    });
  },
  inject: [neo4jConfig.KEY],
} satisfies FactoryProvider;
