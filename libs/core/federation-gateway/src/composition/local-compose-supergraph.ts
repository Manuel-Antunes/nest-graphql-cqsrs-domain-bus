import { Logger } from '@nestjs/common';

import { composeSupergraphSdl, deriveApiSchemaSdl } from './compose-supergraph';
import type { SubgraphSource } from './subgraph-source';
import { readSubgraphSdl } from './subgraph-source';

/**
 * The supergraph, composed from subgraph SDL files already on disk rather than by introspecting
 * running subgraphs.
 *
 * Introspecting at boot makes the gateway wait on a round trip to every subgraph, so a cold subgraph
 * stalls the gateway's own start — on Lambda, one cold start cascades into the next and the gateway
 * answers 504 until both are warm. SDL files are build artifacts: composing them is instant,
 * network-free and cannot cascade. Routing still targets each subgraph's live URL.
 */
export class LocalComposeSupergraph {
  private readonly logger = new Logger(LocalComposeSupergraph.name);
  private supergraphSdl: string | null = null;
  private apiSchemaSdl: string | null = null;

  constructor(private readonly subgraphs: readonly SubgraphSource[]) {}

  /** The subgraphs' names, in the order they were given. */
  get subgraphNames(): readonly string[] {
    return this.subgraphs.map((subgraph) => subgraph.name);
  }

  /**
   * Reads every subgraph's SDL and composes. The result is kept, so later calls — and
   * {@link apiSchema} — answer from it.
   */
  compose(): string {
    if (this.supergraphSdl) return this.supergraphSdl;
    this.supergraphSdl = composeSupergraphSdl(
      this.subgraphs.map((subgraph) => ({
        name: subgraph.name,
        url: subgraph.url,
        sdl: readSubgraphSdl(subgraph.sdlDir),
      })),
    );
    this.logger.log(
      `Composed the supergraph from ${this.subgraphNames.join(', ')}`,
    );
    return this.supergraphSdl;
  }

  /** The client-facing schema of what {@link compose} produced. */
  apiSchema(): string {
    this.apiSchemaSdl ??= deriveApiSchemaSdl(this.compose());
    return this.apiSchemaSdl;
  }
}
