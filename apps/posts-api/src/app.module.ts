import { join } from 'node:path';
import { AutomapperModule } from '@automapper/nestjs';
import type { YogaFederationDriverConfig } from '@graphql-yoga/nestjs-federation';
import { YogaFederationDriver } from '@graphql-yoga/nestjs-federation';
import { Module } from '@nestjs/common';
import { GraphQLISODateTime, GraphQLModule } from '@nestjs/graphql';
import { AssetInfrastructureModule } from '@nestposts/asset/infrastructure/asset-infrastructure.module';
import { assetStorageOptionsFromEnv } from '@nestposts/asset/infrastructure/storage/asset-storage.options';
import { AuthInfrastructureModule } from '@nestposts/auth/infrastructure/auth-infrastructure.module';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule, TenancyModule } from '@nestposts/database';
import { PublishingOnDemandNotifications } from '@nestposts/notifications/infrastructure/on-demand/publishing-on-demand-notifications';
import { loggingModule } from '@nestposts/observability';
import { ErrorReportingModule } from '@nestposts/observability/error-reporting.module';
import { useGraphQLErrorReporting } from '@nestposts/observability/graphql-error-reporting';
import { useGraphQLTracing } from '@nestposts/observability/graphql-tracing';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { TenantMembershipModule } from '@nestposts/organizations/infrastructure/tenancy/tenant-membership.module';
import {
  EventTrace,
  IncomingRequest,
  MikroOrmMessageInbox,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
  TransportTenantResolver,
} from '@nestposts/transport-eventbus';

import { PostRequestContextCodec } from './application/shared/post-request-context.codec';
import { PostEventsPublisher } from './infrastructure/outbox/post-events.publisher';
import {
  mikroOrmConfig,
  tenantMigrations,
} from './infrastructure/persistence/mikro-orm.config';
import {
  POST_EVENTS_CLIENT,
  postEventsClient,
  postsApiIdentity,
  subscriptionsFromFeed,
} from './infrastructure/transport/transport.config';
import {
  subscriptionDeadline,
  subscriptionMaxSeconds,
} from './interfaces/graphql/subscription-deadline.plugin';
import { InterfacesModule } from './interfaces/interfaces.module';
import { MapperErrorHandler } from './interfaces/mapper/mapper-error.handler';
import { validatedDtoClasses } from './interfaces/mapper/validated-dto.strategy';

@Module({
  imports: [
    loggingModule({
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'posts-api',
    }),
    ErrorReportingModule.forRoot({ traceOf: IncomingRequest.traceOf }),
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    DatabaseModule.forRoot(mikroOrmConfig()),
    TenancyModule.forRoot({
      resolver: TransportTenantResolver,
      migrations: tenantMigrations(),
    }),
    AuthInfrastructureModule.forRoot({
      plugins: organizationAuthPluginProviders,
      entities: OrganizationEntities.withAuth(),
      imports: [OrganizationsInfrastructureModule],
      notifications: PublishingOnDemandNotifications,
    }),
    TenantMembershipModule,
    GraphQLModule.forRoot<YogaFederationDriverConfig>({
      driver: YogaFederationDriver,
      typePaths: [join(__dirname, 'graphql', '**/*.graphql')],
      resolvers: { DateTime: GraphQLISODateTime },
      fieldResolverEnhancers: ['interceptors'],
      graphiql: true,
      maskedErrors: false,
      plugins: [
        useGraphQLTracing({ originOf: EventTrace.of }),
        useGraphQLErrorReporting(),
        ...(subscriptionMaxSeconds()
          ? [subscriptionDeadline(subscriptionMaxSeconds())]
          : []),
      ],
    }),
    AutomapperModule.forRoot({
      strategyInitializer: validatedDtoClasses(),
      errorHandler: new MapperErrorHandler(),
    }),
    AssetInfrastructureModule.forRoot(assetStorageOptionsFromEnv()),
    TransportEventBusModule.forRoot({
      identity: postsApiIdentity(),
      inbox: MikroOrmMessageInbox,
      requestContext: PostRequestContextCodec,
      subscriptions: subscriptionsFromFeed(),
      publishers: [
        PostEventsPublisher,
        { provide: POST_EVENTS_CLIENT, useFactory: postEventsClient },
      ],
    }),
    InterfacesModule,
  ],
})
export class AppModule {}
