import { AutomapperModule } from "@automapper/nestjs";
import { Module } from "@nestjs/common";
import { GraphQLISODateTime, GraphQLModule } from "@nestjs/graphql";
import {
  YogaFederationDriver,
  type YogaFederationDriverConfig,
} from "@graphql-yoga/nestjs-federation";
import { join } from "node:path";
import { AuthInfrastructureModule } from "@nestposts/auth/infrastructure/auth-infrastructure.module";
import { organizationAuthPluginProviders } from "@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin";
import { OrganizationsInfrastructureModule } from "@nestposts/organizations/infrastructure/organizations-infrastructure.module";
import { OrganizationEntities } from "@nestposts/organizations/infrastructure/persistence/organization-entities";
import { CqsrsModule } from "@nestposts/cqsrs";
import { loggingModule } from "@nestposts/observability";
import { DatabaseModule, TenancyModule } from "@nestposts/database";
import {
  MikroOrmMessageInbox,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
  TransportTenantResolver,
} from "@nestposts/transport-eventbus";
import { mikroOrmConfig } from "./infrastructure/persistence/mikro-orm.config";
import { InterfacesModule } from "./interfaces/interfaces.module";
import { PostEventsPublisher } from "./infrastructure/outbox/post-events.publisher";
import {
  POST_EVENTS_CLIENT,
  postEventsClient,
  postsApiIdentity,
  subscriptionsFromFeed,
} from "./infrastructure/transport/transport.config";
import { MapperErrorHandler } from "./interfaces/mapper/mapper-error.handler";
import { validatedDtoClasses } from "./interfaces/mapper/validated-dto.strategy";
import { PostRequestContextCodec } from "./application/shared/post-request-context.codec";

@Module({
  imports: [
    loggingModule({ serviceName: process.env.OTEL_SERVICE_NAME ?? "posts-api" }),
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    DatabaseModule.forRoot(mikroOrmConfig()),
    TenancyModule.forRoot({ resolver: TransportTenantResolver }),
    AuthInfrastructureModule.forRoot({
      plugins: organizationAuthPluginProviders,
      entities: OrganizationEntities.withAuth(),
      imports: [OrganizationsInfrastructureModule],
    }),
    GraphQLModule.forRoot<YogaFederationDriverConfig>({
      driver: YogaFederationDriver,
      typePaths: [join(__dirname, "graphql", "**/*.graphql")],
      resolvers: { DateTime: GraphQLISODateTime },
      fieldResolverEnhancers: ["interceptors"],
      graphiql: true,
      maskedErrors: false,
    }),
    AutomapperModule.forRoot({
      strategyInitializer: validatedDtoClasses(),
      errorHandler: new MapperErrorHandler(),
    }),
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
