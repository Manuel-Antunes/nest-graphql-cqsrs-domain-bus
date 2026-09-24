import { getStitchedSchemaFromSupergraphSdl } from '@graphql-tools/federation';
import { Logger } from '@nestjs/common';
import type { GraphQLSchema } from 'graphql';

import type {
  GatewayIdentity,
  GatewayTokenVerifier,
  SubgraphTokenResolver,
} from '../auth/gateway-identity';
import {
  applyInterfaceObjects,
  collectInterfaceObjects,
  type InterfaceObjectMapping,
  implementationTypeDefs,
  interfaceObjectKeyFn,
  rewriteInterfaceObjectTypeConditions,
  subgraphNamesByGraphEnum,
} from './interface-object';
import { joinGraphEnumName } from './join-graph';
import type { SubgraphExecutor } from './traced-executor';
import { tracedExecutor } from './traced-executor';

/** The headers each subgraph is sent, by subgraph name AND by its `join__Graph` enum value. */
export type SubgraphHeaders = Record<string, Record<string, string>>;

/** Inbound request headers, as Node hands them over. */
export type InboundHeaders = Record<string, string | string[] | undefined>;

/** What the gateway's GraphQL context carries for one inbound request. */
export interface GatewayContext {
  req?: { headers?: InboundHeaders };
  identity?: GatewayIdentity | null;
  subgraphHeaders?: SubgraphHeaders;
}

/**
 * The headers forwarded to every subgraph unless configured otherwise: the session cookie, the
 * bearer, and the tenant. Trace context is NOT among them — the gateway's own HTTP instrumentation
 * writes `traceparent` on each outbound call, so the subgraph's span is a child of the gateway's
 * rather than of the gateway's caller.
 */
export const DEFAULT_FORWARDED_HEADERS: readonly string[] = [
  'cookie',
  'authorization',
  'x-tenant',
];

export interface StitchedGatewayOptions {
  /** Verifies the inbound bearer once per request. Without one, nothing is derived from tokens. */
  readonly tokenVerifier?: GatewayTokenVerifier;
  /** Per-subgraph credential translation; a subgraph with none receives the inbound bearer. */
  readonly subgraphTokenResolvers?: readonly SubgraphTokenResolver[];
  /** Replaces {@link DEFAULT_FORWARDED_HEADERS}. `authorization` is always subject to the resolvers. */
  readonly forwardedHeaders?: readonly string[];
}

/**
 * The federated schema, executed by `@graphql-tools/federation` rather than by `@apollo/gateway`.
 *
 * Apollo's gateway refuses to execute subscriptions, and `YogaGatewayDriver` is that gateway behind
 * Yoga: it starts an `ApolloGateway` and hands Yoga a schema that is empty until then, so putting SSE
 * in front of it changes the wire format and nothing about what can run. A stitched schema executes
 * subscriptions — over SSE, end to end, which `federated-subscriptions.spec.ts` asserts.
 *
 * Composition is not this class's business: it takes a supergraph SDL, whatever composed it.
 */
export class StitchedGateway {
  private readonly logger = new Logger(StitchedGateway.name);
  private cache: { sdl: string; schema: GraphQLSchema } | null = null;
  private readonly resolvers: ReadonlyMap<string, SubgraphTokenResolver>;
  private readonly forwarded: readonly string[];

  constructor(private readonly options: StitchedGatewayOptions = {}) {
    this.resolvers = new Map(
      (options.subgraphTokenResolvers ?? []).map((resolver) => [
        resolver.subgraph,
        resolver,
      ]),
    );
    this.forwarded = (options.forwardedHeaders ?? DEFAULT_FORWARDED_HEADERS)
      .map((name) => name.toLowerCase())
      .filter((name) => name !== 'authorization');
  }

  /** The executable schema of a supergraph; rebuilt only when the SDL changes. */
  build(supergraphSdl: string): GraphQLSchema {
    if (this.cache?.sdl === supergraphSdl) return this.cache.schema;

    const interfaceObjects = collectInterfaceObjects(supergraphSdl);
    const graphNames = subgraphNamesByGraphEnum(supergraphSdl);
    if (interfaceObjects.length) {
      this.logger.log(
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

    const schema = getStitchedSchemaFromSupergraphSdl({
      supergraphSdl: applyInterfaceObjects(supergraphSdl, interfaceObjects),
      httpExecutorOpts: ({ name }) => ({
        headers: (executorRequest) =>
          (executorRequest?.context as GatewayContext | undefined)
            ?.subgraphHeaders?.[name] ?? {},
      }),
      onSubgraphAST: (subgraphName, subgraphAst) =>
        mappingsFor(subgraphName).reduce(
          (ast, mapping) => implementationTypeDefs(ast, mapping),
          subgraphAst,
        ),
      onSubschemaConfig: (subschemaConfig) => {
        const name = subschemaConfig.name ?? '';
        const mappings = mappingsFor(name);

        for (const mapping of mappings) {
          for (const implementation of mapping.implementations) {
            const merged = subschemaConfig.merge?.[implementation];
            if (merged) {
              merged.key = interfaceObjectKeyFn(
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
                document: rewriteInterfaceObjectTypeConditions(
                  request.document,
                  mappings,
                ),
              })
          : inner;
        subschemaConfig.executor = tracedExecutor(
          graphNames.get(name) ?? name,
          executor,
        ) as never;
      },
    });

    this.cache = { sdl: supergraphSdl, schema };
    return schema;
  }

  /**
   * What each subgraph is sent for one inbound request, resolved ONCE: the forwarded headers, the
   * mark `x-gateway: true`, the tenant (the inbound `x-tenant`, or the organization the verified token
   * is bound to), and per subgraph either its resolver's native credential or the inbound bearer.
   *
   * Every entry is filed under the subgraph's name AND its `join__Graph` enum value — callers ask by
   * name, the executor asks by value (see {@link joinGraphEnumName}).
   */
  async resolveSubgraphHeaders(
    requestHeaders: InboundHeaders | undefined,
    subgraphNames: readonly string[],
  ): Promise<{ identity: GatewayIdentity | null; headers: SubgraphHeaders }> {
    const header = (name: string): string | undefined => {
      const value = requestHeaders?.[name];
      return Array.isArray(value) ? value[0] : value;
    };

    const common: Record<string, string> = { 'x-gateway': 'true' };
    for (const name of this.forwarded) {
      const value = header(name);
      if (value) common[name] = value;
    }

    const authorization = header('authorization');
    const identity = authorization
      ? await (
          this.options.tokenVerifier?.verify(authorization) ??
          Promise.resolve(null)
        ).catch(() => null)
      : null;

    if (!common['x-tenant'] && identity?.organizationSlug) {
      common['x-tenant'] = identity.organizationSlug;
    }

    const headers: SubgraphHeaders = {};
    for (const name of subgraphNames) {
      const forSubgraph = { ...common };
      const native = await this.resolvers
        .get(name)
        ?.resolve(identity)
        .catch(() => null);
      if (native) {
        forSubgraph[native.name.toLowerCase()] = native.value;
      } else if (authorization) {
        forSubgraph.authorization = authorization;
      }
      headers[name] = forSubgraph;
      headers[joinGraphEnumName(name)] = forSubgraph;
    }

    return { identity, headers };
  }
}
