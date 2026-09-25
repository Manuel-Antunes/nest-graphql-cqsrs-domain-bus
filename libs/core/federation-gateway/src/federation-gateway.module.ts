import type { YogaDriverConfig } from '@graphql-yoga/nestjs';
import { YogaDriver } from '@graphql-yoga/nestjs';
import type { DynamicModule } from '@nestjs/common';
import { Controller, Get, Header, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';

import { LocalComposeSupergraph } from './composition/local-compose-supergraph';
import type {
  GatewayContext,
  InboundHeaders,
} from './execution/stitched-gateway';
import { StitchedGateway } from './execution/stitched-gateway';
import type {
  FederationGatewayAsyncOptions,
  FederationGatewayOptions,
} from './federation-gateway.options';
import { FEDERATION_GATEWAY_OPTIONS } from './federation-gateway.options';

@Controller()
class SupergraphSchemaController {
  constructor(private readonly supergraph: LocalComposeSupergraph) {}

  @Get('graphql/schema.graphql')
  @Header('content-type', 'text/plain; charset=utf-8')
  apiSchema(): string {
    return this.supergraph.apiSchema();
  }
}

@Module({})
class FederationGatewayCoreModule {
  static forRootAsync<Injected extends unknown[]>(
    options: FederationGatewayAsyncOptions<Injected>,
  ): DynamicModule {
    return {
      module: FederationGatewayCoreModule,
      providers: [
        {
          provide: FEDERATION_GATEWAY_OPTIONS,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
        {
          provide: LocalComposeSupergraph,
          inject: [FEDERATION_GATEWAY_OPTIONS],
          useFactory: ({ subgraphs }: FederationGatewayOptions) =>
            new LocalComposeSupergraph(subgraphs),
        },
        {
          provide: StitchedGateway,
          inject: [FEDERATION_GATEWAY_OPTIONS],
          useFactory: (gateway: FederationGatewayOptions) =>
            new StitchedGateway({
              tokenVerifier: gateway.tokenVerifier,
              subgraphTokenResolvers: gateway.subgraphTokenResolvers,
              forwardedHeaders: gateway.forwardedHeaders,
            }),
        },
      ],
      exports: [
        FEDERATION_GATEWAY_OPTIONS,
        LocalComposeSupergraph,
        StitchedGateway,
      ],
    };
  }
}

const yogaOptionsFor = (
  options: FederationGatewayOptions,
  supergraph: LocalComposeSupergraph,
  gateway: StitchedGateway,
): Omit<YogaDriverConfig, 'driver'> => ({
  schema: gateway.build(supergraph.compose()),
  path: options.path ?? '/graphql',
  graphiql: options.graphiql ?? true,
  cors: options.cors,
  plugins: options.plugins,
  context: async ({
    req,
  }: {
    req?: { headers?: InboundHeaders };
  }): Promise<GatewayContext> => {
    const { identity, headers } = await gateway.resolveSubgraphHeaders(
      req?.headers,
      supergraph.subgraphNames,
    );
    return { req, identity, subgraphHeaders: headers };
  },
});

/**
 * **A federation gateway, as a module.** Composes the supergraph from the subgraphs' SDL files at
 * boot, executes it with `@graphql-tools/federation` under Yoga — queries, mutations and
 * subscriptions over SSE — and forwards each caller's credentials to every subgraph it reaches.
 *
 * It installs `GraphQLModule` itself, with `YogaDriver`; an application imports this module and does
 * not configure GraphQL again. The composed API schema is served at `GET /graphql/schema.graphql`
 * for tooling. A supergraph that does not compose stops the boot, rather than serving a schema that
 * answers every operation with a validation error.
 */
@Module({})
export class FederationGatewayModule {
  static forRoot(options: FederationGatewayOptions): DynamicModule {
    return FederationGatewayModule.forRootAsync({ useFactory: () => options });
  }

  /** {@link FederationGatewayModule.forRoot}, with the options built from injected configuration. */
  static forRootAsync<Injected extends unknown[]>(
    options: FederationGatewayAsyncOptions<Injected>,
  ): DynamicModule {
    const core = FederationGatewayCoreModule.forRootAsync(options);
    return {
      module: FederationGatewayModule,
      imports: [
        core,
        GraphQLModule.forRootAsync<YogaDriverConfig>({
          driver: YogaDriver,
          imports: [core],
          inject: [
            FEDERATION_GATEWAY_OPTIONS,
            LocalComposeSupergraph,
            StitchedGateway,
          ],
          useFactory: yogaOptionsFor,
        }),
      ],
      controllers: [SupergraphSchemaController],
      exports: [core],
    };
  }
}
