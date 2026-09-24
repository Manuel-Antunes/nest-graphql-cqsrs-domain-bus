import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { print } from 'graphql';

/** A subgraph whose SDL lives on disk: a schema-first subgraph's own `.graphql` files. */
export interface SubgraphSource {
  /** See {@link SubgraphSdl.name}. */
  readonly name: string;
  /** See {@link SubgraphSdl.url}. */
  readonly url: string;
  /** The directory holding the subgraph's `.graphql` files, read in name order. */
  readonly sdlDir: string;
}

/**
 * Every `.graphql` file of a directory as one SDL document, merged the way `@nestjs/graphql` merges a
 * schema-first subgraph's `typePaths`. Concatenating them is not the same thing: two files that each
 * declare `type Mutation` are one type to Nest and a duplicate to composition.
 */
export function readSubgraphSdl(sdlDir: string): string {
  const files = readdirSync(sdlDir)
    .filter((file) => file.endsWith('.graphql'))
    .sort();
  if (!files.length) {
    throw new Error(`No .graphql files in ${sdlDir}`);
  }
  return print(
    mergeTypeDefs(
      files.map((file) => readFileSync(join(sdlDir, file), 'utf8')),
    ),
  );
}
