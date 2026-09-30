import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import type { MikroORM } from '@nestposts/database';
import { inRequestContext } from '@nestposts/database';

import type {
  SubgraphHeaderResolver,
  SubgraphHeaders,
} from './subgraph.header-resolver';

export interface BuiltSubgraphHeaderResolverFactory {
  resolve(subgraphName: string): Promise<SubgraphHeaders>;
}

export class SubgraphHeaderResolverFactory {
  private readonly resolvers: ReadonlyMap<string, SubgraphHeaderResolver>;

  constructor(
    private readonly orm: MikroORM,
    private readonly fallback: SubgraphHeaderResolver,
    resolvers: readonly SubgraphHeaderResolver[],
  ) {
    this.resolvers = SubgraphHeaderResolverFactory.byName(resolvers);
  }

  build(
    identity: Identity | null,
    req: unknown,
  ): BuiltSubgraphHeaderResolverFactory {
    const resolved = new Map<
      SubgraphHeaderResolver,
      Promise<SubgraphHeaders>
    >();
    return {
      resolve: (subgraphName) => {
        const resolver = this.resolvers.get(subgraphName) ?? this.fallback;
        const known = resolved.get(resolver);
        if (known) return known;
        const headers = inRequestContext(this.orm, () =>
          resolver.resolve(identity, req),
        );
        resolved.set(resolver, headers);
        return headers;
      },
    };
  }

  private static byName(
    resolvers: readonly SubgraphHeaderResolver[],
  ): ReadonlyMap<string, SubgraphHeaderResolver> {
    const byName = new Map<string, SubgraphHeaderResolver>();
    for (const resolver of resolvers) {
      const name = resolver.subgraphName;
      if (!name) {
        throw new Error(`${resolver.constructor.name} names no subgraph`);
      }
      if (byName.has(name)) {
        throw new Error(`Duplicate subgraph header resolver for ${name}`);
      }
      byName.set(name, resolver);
    }
    return byName;
  }
}
