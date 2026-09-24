import { composeServices } from '@apollo/composition';
import { printSchema, Supergraph } from '@apollo/federation-internals';
import { parse } from 'graphql';

/** One subgraph's contribution to the supergraph. */
export interface SubgraphSdl {
  /**
   * The subgraph's name. Composition turns it into the `join__Graph` enum value the gateway routes
   * by, and the gateway files each subgraph's forwarded headers under it.
   */
  readonly name: string;
  /** Where the gateway sends this subgraph's share of an operation. */
  readonly url: string;
  /** The subgraph's federation SDL — what its `_service { sdl }` would answer. */
  readonly sdl: string;
}

/** The subgraphs did not compose; `errors` lists every reason composition gave. */
export class SupergraphCompositionException extends Error {
  constructor(readonly errors: readonly string[]) {
    super(
      `Supergraph composition failed:\n${errors
        .map((error) => `  - ${error}`)
        .join('\n')}`,
    );
    this.name = SupergraphCompositionException.name;
  }
}

/**
 * Composes the supergraph SDL with `@apollo/composition` — the composer Apollo's own gateway and
 * router use — so what this gateway executes is exactly what `rover supergraph compose` would print.
 *
 * @throws SupergraphCompositionException when the subgraphs do not compose.
 */
export function composeSupergraphSdl(
  subgraphs: readonly SubgraphSdl[],
): string {
  const result = composeServices(
    subgraphs.map((subgraph) => ({
      name: subgraph.name,
      url: subgraph.url,
      typeDefs: parse(subgraph.sdl),
    })),
  );

  if (result.errors) {
    throw new SupergraphCompositionException(
      result.errors.map((error) => error.message),
    );
  }

  return result.supergraphSdl;
}

/**
 * The client-facing API schema of a composed supergraph: every `@join__*`, `@link` and
 * `@inaccessible` stripped. It is what a client of the gateway introspects, and what a code
 * generator should read.
 *
 * Printed by `@apollo/federation-internals` itself, never through `graphql`'s `printSchema`: the
 * package is CommonJS and holds its own `graphql`, so wherever `graphql` also loads as ESM (Vitest,
 * for one) the two are different realms and graphql-js refuses the other's types.
 */
export function deriveApiSchemaSdl(supergraphSdl: string): string {
  return printSchema(Supergraph.build(supergraphSdl).apiSchema());
}
