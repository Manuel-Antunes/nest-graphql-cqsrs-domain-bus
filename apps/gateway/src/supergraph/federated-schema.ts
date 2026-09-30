import { getStitchedSchemaFromSupergraphSdl } from '@graphql-tools/federation';
import { Logger } from '@nestjs/common';
import type { GraphQLSchema } from 'graphql';

import type { InterfaceObjectMapping } from './interface-objects';
import { InterfaceObjects } from './interface-objects';
import { Supergraph } from './supergraph';
import type { SubgraphExecutor } from './traced-executor';
import { TracedExecutor } from './traced-executor';

export interface SubgraphCallContext {
  readonly subgraphHeaders?: Readonly<Record<string, string>>;
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
      httpExecutorOpts: {
        headers: (executorRequest) => ({
          ...(executorRequest?.context as SubgraphCallContext | undefined)
            ?.subgraphHeaders,
        }),
      },
      onSubgraphAST: (subgraphName, subgraphAst) =>
        mappingsFor(subgraphName).reduce(
          (ast, mapping) =>
            InterfaceObjects.implementationTypeDefs(ast, mapping),
          subgraphAst,
        ),
      onSubschemaConfig: (subschemaConfig) => {
        const name = subschemaConfig.name ?? '';
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
        const executor: SubgraphExecutor = mappings.length
          ? (request) =>
              inner({
                ...request,
                document: InterfaceObjects.rewriteTypeConditions(
                  request.document,
                  mappings,
                ),
              })
          : inner;
        subschemaConfig.executor = TracedExecutor.wrap(
          graphNames.get(name) ?? name,
          executor,
        ) as never;
      },
    });
  }
}
