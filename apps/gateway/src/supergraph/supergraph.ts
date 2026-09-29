import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeServices } from '@apollo/composition';
import {
  Supergraph as ApolloSupergraph,
  printSchema,
} from '@apollo/federation-internals';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { Logger } from '@nestjs/common';
import type { EnumValueDefinitionNode } from 'graphql';
import { Kind, parse, print } from 'graphql';

export interface SubgraphSource {
  readonly name: string;
  readonly url: string;
  readonly sdlDir: string;
}

export interface SubgraphSdl {
  readonly name: string;
  readonly url: string;
  readonly sdl: string;
}

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

export class Supergraph {
  private readonly logger = new Logger(Supergraph.name);
  private supergraphSdl: string | null = null;
  private apiSchemaSdl: string | null = null;

  constructor(private readonly subgraphs: readonly SubgraphSource[]) {}

  static readSdl(sdlDir: string): string {
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

  static compose(subgraphs: readonly SubgraphSdl[]): string {
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

  static subgraphNamesOf(supergraphSdl: string): ReadonlyMap<string, string> {
    const names = new Map<string, string>();
    for (const definition of parse(supergraphSdl, { noLocation: true })
      .definitions) {
      if (
        definition.kind !== Kind.ENUM_TYPE_DEFINITION ||
        definition.name.value !== 'join__Graph'
      ) {
        continue;
      }
      for (const value of definition.values ?? []) {
        const name = Supergraph.subgraphNameOf(value);
        if (name) names.set(value.name.value, name);
      }
    }
    return names;
  }

  private static subgraphNameOf(
    value: EnumValueDefinitionNode,
  ): string | undefined {
    const argument = value.directives
      ?.find((directive) => directive.name.value === 'join__graph')
      ?.arguments?.find((candidate) => candidate.name.value === 'name');
    return argument?.value.kind === Kind.STRING
      ? argument.value.value
      : undefined;
  }

  get subgraphNames(): readonly string[] {
    return this.subgraphs.map((subgraph) => subgraph.name);
  }

  sdl(): string {
    if (this.supergraphSdl) return this.supergraphSdl;
    this.supergraphSdl = Supergraph.compose(
      this.subgraphs.map((subgraph) => ({
        name: subgraph.name,
        url: subgraph.url,
        sdl: Supergraph.readSdl(subgraph.sdlDir),
      })),
    );
    this.logger.log(
      `Composed the supergraph from ${this.subgraphNames.join(', ')}`,
    );
    return this.supergraphSdl;
  }

  apiSchema(): string {
    this.apiSchemaSdl ??= printSchema(
      ApolloSupergraph.build(this.sdl()).apiSchema(),
    );
    return this.apiSchemaSdl;
  }
}
