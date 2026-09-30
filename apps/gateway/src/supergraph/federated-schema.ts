import { getStitchedSchemaFromSupergraphSdl } from '@graphql-tools/federation';
import { Logger } from '@nestjs/common';
import type { GraphQLSchema } from 'graphql';

import type { SubgraphHeaders } from './header-resolvers/subgraph.header-resolver';
import type { BuiltSubgraphHeaderResolverFactory } from './header-resolvers/subgraph-header-resolver.factory';
import type { InterfaceObjectMapping } from './interface-objects';
import { InterfaceObjects } from './interface-objects';
import { Supergraph } from './supergraph';
import type { SubgraphExecutor, SubgraphRequest } from './traced-executor';
import { TracedExecutor } from './traced-executor';

export interface SubgraphCallContext {
  readonly builtSubgraphHeaderResolverFactory?: BuiltSubgraphHeaderResolverFactory;
}

export class FederatedSchemaFactory {
  private static readonly logger = new Logger(FederatedSchemaFactory.name);

  static of(supergraphSdl: string): GraphQLSchema {
    const interfaceObjects = InterfaceObjects.collect(supergraphSdl);
    const graphNames = Supergraph.subgraphNamesOf(supergraphSdl);
    if (interfaceObjects.length) {
      FederatedSchemaFactory.logger.log(
        `Wiring @interfaceObject for ${interfaceObjects
          .map(
            (mapping) =>
              `${mapping.interfaceName}.{${mapping.fields.join(',')}} → ${mapping.graph}`,
          )
          .join(', ')}`,
      );
    }

    const mappingsFor = (subgraph: string): InterfaceObjectMapping[] =>
      interfaceObjects.filter(
        (mapping) =>
          mapping.graph === subgraph ||
          graphNames.get(mapping.graph) === subgraph,
      );

    return getStitchedSchemaFromSupergraphSdl({
      supergraphSdl: InterfaceObjects.apply(supergraphSdl, interfaceObjects),
      onSubgraphAST: (subgraphName, subgraphAst) =>
        mappingsFor(subgraphName).reduce(
          (ast, mapping) =>
            InterfaceObjects.implementationTypeDefs(ast, mapping),
          subgraphAst,
        ),
      onSubschemaConfig: (subschemaConfig) => {
        const name = subschemaConfig.name ?? '';
        const subgraph = graphNames.get(name) ?? name;
        const mappings = mappingsFor(name);

        for (const mapping of mappings) {
          for (const implementation of mapping.implementations) {
            const merged = subschemaConfig.merge?.[implementation];
            if (merged) {
              merged.key = InterfaceObjects.keyFn(
                mapping,
                merged.key as never,
              ) as never;
            }
          }
        }

        const inner = subschemaConfig.executor as SubgraphExecutor | undefined;
        if (!inner) return;
        const rewritten: SubgraphExecutor = mappings.length
          ? (request) =>
              inner({
                ...request,
                document: InterfaceObjects.rewriteTypeConditions(
                  request.document,
                  mappings,
                ),
              })
          : inner;
        const executor: SubgraphExecutor = async (request) =>
          rewritten({
            ...request,
            extensions: {
              ...request.extensions,
              headers: await FederatedSchemaFactory.headersFor(
                request,
                subgraph,
              ),
            },
          });
        subschemaConfig.executor = TracedExecutor.wrap(
          subgraph,
          executor,
        ) as never;
      },
    });
  }

  private static headersFor(
    request: SubgraphRequest,
    subgraph: string,
  ): Promise<SubgraphHeaders> {
    const headers = (
      request.context as SubgraphCallContext | undefined
    )?.builtSubgraphHeaderResolverFactory?.resolve(subgraph);
    return headers ?? Promise.resolve({});
  }
}
