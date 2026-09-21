import { AutomapperModule } from "@automapper/nestjs";
import { MikroORM, RequestContext } from "@mikro-orm/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { GraphQLISODateTime, GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import { join } from "node:path";
import { CqsrsModule } from "@nestposts/cqsrs";
import { TRANSPORT_EVENT_BUS_PUBLISHER } from "@nestposts/transport-eventbus";
import { createAuth } from "@nestposts/users/infrastructure/auth/auth";
import { mikroOrmConfig } from "./infrastructure/persistence/mikro-orm.config";
import { InterfacesModule } from "./interfaces/interfaces.module";
import { TransportModule } from "./infrastructure/transport/transport.module";
import { MapperErrorHandler } from "./interfaces/mapper/mapper-error.handler";
import { validatedDtoClasses } from "./interfaces/mapper/validated-dto.strategy";

@Module({
  imports: [
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    MikroOrmModule.forRoot(mikroOrmConfig()),
    AuthModule.forRootAsync({
      imports: [MikroOrmModule],
      inject: [MikroORM],
      useFactory: (orm: MikroORM) => ({
        auth: createAuth(orm),
        middleware: (_req: unknown, _res: unknown, next: () => void) =>
          RequestContext.create(orm.em, next),
      }),
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: [join(__dirname, "graphql", "**/*.graphql")],
      resolvers: { DateTime: GraphQLISODateTime },
      fieldResolverEnhancers: ["interceptors"],
      graphiql: true,
      subscriptions: { "graphql-ws": true },
      includeStacktraceInErrorResponses: false,
    }),
    AutomapperModule.forRoot({
      strategyInitializer: validatedDtoClasses(),
      errorHandler: new MapperErrorHandler(),
    }),
    TransportModule,
    InterfacesModule,
  ],
})
export class AppModule {}
