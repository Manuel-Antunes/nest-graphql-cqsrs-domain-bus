import type { YogaDriverConfig } from '@graphql-yoga/nestjs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import type { GqlOptionsFactory } from '@nestjs/graphql';
import { IdentityResolver } from '@nestposts/auth/domain/auth/identity.resolver';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { RequestCredentials } from '@nestposts/auth/infrastructure/request/request-credentials';
import { RequestHeaders } from '@nestposts/auth/infrastructure/request/request-headers';
import { inRequestContext, MikroORM, TENANT_HEADER } from '@nestposts/database';
import { useGraphQLErrorReporting } from '@nestposts/observability/graphql-error-reporting';
import { useGraphQLTracing } from '@nestposts/observability/graphql-tracing';

import type { AppConfig } from '../config/app.config';
import { appConfig } from '../config/app.config';
import { FederatedSchema } from '../supergraph/federated-schema';
import { Supergraph } from '../supergraph/supergraph';
import { TracedExecutor } from '../supergraph/traced-executor';
import type { GatewayContext, GatewayServerContext } from './gateway-context';
import { OrganizationSlugs } from './organization-slugs';

export type GatewayDriverConfig = YogaDriverConfig<'fastify'>;

@Injectable()
export class GatewayGqlOptionsFactory
  implements GqlOptionsFactory<GatewayDriverConfig>
{
  private readonly logger = new Logger(GatewayGqlOptionsFactory.name);

  constructor(
    @Inject(appConfig.KEY)
    private readonly app: Pick<AppConfig, 'corsOrigins'>,
    private readonly supergraph: Supergraph,
    private readonly moduleRef: ModuleRef,
    private readonly organizations: OrganizationSlugs,
    private readonly orm: MikroORM,
  ) {}

  createGqlOptions(): Omit<GatewayDriverConfig, 'driver'> {
    return {
      schema: FederatedSchema.of(this.supergraph.sdl()),
      path: '/graphql',
      graphiql: true,
      cors: { origin: this.app.corsOrigins, credentials: true },
      plugins: [
        useGraphQLTracing({
          resolvers: false,
          originOf: (payload) => TracedExecutor.originOf(payload),
        }),
        useGraphQLErrorReporting(),
      ],
      context: ({ req }: GatewayServerContext): Promise<GatewayContext> =>
        this.contextOf(req),
    };
  }

  private contextOf(req: unknown): Promise<GatewayContext> {
    return inRequestContext(this.orm, async () => {
      const identity = await this.identityOf(req);
      const tenant =
        RequestHeaders.from(req).get(TENANT_HEADER) ??
        (await this.organizations.of(identity?.activeOrganizationId));
      return {
        identity,
        subgraphHeaders: {
          ...RequestCredentials.of(req).toHeaders(),
          ...(tenant && { [TENANT_HEADER]: tenant }),
        },
      };
    });
  }

  private async identityOf(req: unknown): Promise<Identity | null> {
    try {
      const contextId = ContextIdFactory.create();
      this.moduleRef.registerRequestByContextId(req, contextId);
      const caller = await this.moduleRef.resolve(IdentityResolver, contextId, {
        strict: false,
      });
      return await caller.identity();
    } catch (failure) {
      this.logger.warn(
        `the caller's session could not be read, and is forwarded unresolved: ${(failure as Error)?.message ?? String(failure)}`,
      );
      return null;
    }
  }
}
